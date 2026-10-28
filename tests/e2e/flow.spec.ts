import { expect, test, type Page } from "@playwright/test";
import { E2E_SETUP_TOKEN } from "../../playwright.config";
import { addAuthenticator, removeAuthenticator } from "./helpers";

type Authenticator = Awaited<ReturnType<typeof addAuthenticator>>;

// One admin journey, in order: first-run setup → create client → client logs
// in → admin regenerates the code (passkey step-up) → client session dies.
test.describe.configure({ mode: "serial" });

let admin: Page;
let code = "";
let clientUrl = "";
let laptop: Authenticator;

test.beforeAll(async ({ browser }) => {
  admin = await browser.newPage();
});

test("first-run setup needs the setup token and two passkeys, then shows 10 recovery codes once", async () => {
  await admin.goto("/admin/login");
  await expect(admin).toHaveURL(/\/admin\/setup$/);

  // Wrong token is refused.
  await admin.getByLabel("رمز الإعداد").fill("wrong-token");
  await admin.getByRole("button", { name: "تسجيل المفتاح الأول" }).click();
  await expect(admin.getByRole("alert").filter({ hasText: "رمز الإعداد غير صحيح" })).toBeVisible();

  // Two different devices (virtual authenticators).
  const phone = await addAuthenticator(admin);
  await admin.getByLabel("رمز الإعداد").fill(E2E_SETUP_TOKEN);
  await admin.getByRole("button", { name: "تسجيل المفتاح الأول" }).click();
  await expect(admin.getByRole("button", { name: "تسجيل المفتاح الثاني" })).toBeVisible();
  await removeAuthenticator(phone);
  laptop = await addAuthenticator(admin); // stays attached for later step-ups
  await admin.getByRole("button", { name: "تسجيل المفتاح الثاني" }).click();
  await admin.getByRole("button", { name: "إكمال الإعداد وإظهار رموز الاسترداد" }).click();

  const codes = admin.locator(".recovery-grid li");
  await expect(codes).toHaveCount(10);
  await expect(codes.first()).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await admin.getByRole("button", { name: "حفظتها، افتح لوحة الإدارة" }).click();
  await expect(admin).toHaveURL(/\/admin\/clients$/);

  // Setup is closed for good: without an admin session it does not exist.
  const anon = await admin.context().browser()!.newPage();
  const res = await anon.goto("/admin/setup");
  expect(res?.status()).toBe(404);
  await anon.close();
});

test("empty clients list, then create a client and see its code exactly once", async () => {
  await admin.goto("/admin/clients");
  await expect(admin.getByText("لا يوجد عملاء بعد")).toBeVisible();
  await admin.getByRole("button", { name: "عميل جديد" }).first().click();
  const drawer = admin.getByRole("dialog");
  await drawer.getByRole("button", { name: "إنشاء العميل وتوليد الرمز" }).click();
  await expect(drawer.getByText("اكتب اسمًا من حرفين على الأقل.")).toBeVisible();
  await drawer.getByLabel("اسم العميل أو النشاط التجاري").fill("متجر الاختبار");
  await drawer.getByRole("button", { name: "إنشاء العميل وتوليد الرمز" }).click();
  const shown = drawer.getByTestId("new-code");
  await expect(shown).toHaveText(/^[A-Za-z2-9]{4} [A-Za-z2-9]{4} [A-Za-z2-9]{4}$/);
  code = (await shown.textContent())!.replace(/\s/g, "");
  await drawer.getByRole("button", { name: "تم، أغلق النافذة" }).click();

  const row = admin.getByTestId("client-row").filter({ hasText: "متجر الاختبار" });
  await expect(row).toContainText("KTS-0001");
  await expect(row).toContainText("نشط");
  await expect(row).toContainText("بانتظار الربط");
  // The code is never shown again.
  await row.click();
  await expect(admin).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}$/);
  clientUrl = admin.url();
  await expect(admin.getByText("•••• •••• ••••")).toBeVisible();
  await expect(admin.locator("body")).not.toContainText(code);
  await expect(admin.getByTestId("days-left")).toHaveText("30/30");
});

test("client logs in with the code; wrong codes get a generic error", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  const input = page.getByLabel("رمز الدخول");
  await input.fill("WrongCode234");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByText("تعذّر الدخول. تحقّق من الرمز وحاول مرة أخرى.")).toBeVisible();

  await input.fill(` ${code.slice(0, 6)} ${code.slice(6)} `); // whitespace is stripped
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("أهلًا، متجر الاختبار")).toBeVisible();

  const cookies = await ctx.cookies();
  const s = cookies.find((c) => c.name === "__Host-kts_s")!;
  expect(s.httpOnly).toBe(true);
  expect(s.secure).toBe(true);
  expect(s.sameSite).toBe("Lax");

  // A client session gives no access to admin pages.
  await page.goto("/admin/clients");
  await expect(page).toHaveURL(/\/admin\/login$/);

  // Admin sees the session.
  await admin.goto(clientUrl);
  await expect(admin.getByTestId("sessions")).toHaveText("جلسة واحدة");

  // Regenerating the code requires a passkey step-up; it revokes the old code and kills the session.
  await admin.getByRole("button", { name: "توليد رمز جديد" }).click();
  await admin.getByRole("button", { name: "توليد وإبطال القديم" }).click();
  const newCode = admin.getByTestId("regen-code");
  await expect(newCode).toBeVisible();
  const fresh = (await newCode.textContent())!.replace(/\s/g, "");
  expect(fresh).not.toBe(code);
  await admin.getByRole("button", { name: "نسخ الرمز وإغلاق" }).click();
  await expect(admin.getByTestId("sessions")).toHaveText("لا توجد");

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/session-expired$/);
  await expect(page.getByRole("heading", { name: "انتهت جلستك" })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("رمز الدخول").fill(code);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByText(/تعذّر الدخول/)).toBeVisible();
  await page.getByLabel("رمز الدخول").fill(fresh);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  code = fresh;
  await ctx.close();
});

test("renew while active adds 30 days after the current end; admin kill switch is audited", async () => {
  await admin.goto(clientUrl);
  await admin.getByRole("button", { name: "تجديد 30 يومًا" }).click();
  await admin.getByRole("dialog").getByRole("textbox").fill("دُفع نقدًا");
  await admin.getByRole("button", { name: "تأكيد التجديد" }).click();
  await expect(admin.getByTestId("days-left")).toHaveText("60/60");
  await expect(admin.getByText("جُدّد الاشتراك 30 يومًا · «دُفع نقدًا»")).toBeVisible();

  await admin.getByRole("switch", { name: "السماح بالأتمتة لهذا العميل" }).click();
  await expect(admin.getByTestId("bot-reason")).toHaveText("متوقف: أوقفتَه إداريًا");
  await expect(admin.getByText("أُوقفت الأتمتة إداريًا").first()).toBeVisible();
});

test("ending a subscription is refused when the passkey step-up fails", async () => {
  await admin.goto(clientUrl);
  // The admin cannot verify (e.g. cancels the fingerprint prompt).
  await laptop.cdp.send("WebAuthn.setUserVerified", { authenticatorId: laptop.id, isUserVerified: false });
  await admin.getByRole("button", { name: "إنهاء الاشتراك" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "إنهاء الاشتراك" }).click();
  await expect(admin.getByRole("alert").filter({ hasText: "لم يكتمل التحقق بـ Passkey" })).toBeVisible({ timeout: 30_000 });
  await expect(admin.getByTestId("days-left")).toHaveText("60/60");

  // With verification it goes through.
  await laptop.cdp.send("WebAuthn.setUserVerified", { authenticatorId: laptop.id, isUserVerified: true });
  await admin.getByRole("button", { name: "إنهاء الاشتراك" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "إنهاء الاشتراك" }).click();
  await expect(admin.getByTestId("days-left")).toHaveText("0");
  await expect(admin.getByText("أُنهي الاشتراك وتوقفت الأتمتة")).toBeVisible();
});

test("client with an ended subscription sees the expired page (always dark)", async ({ browser }) => {
  const page = await (await browser.newContext({ colorScheme: "light" })).newPage();
  await page.goto("/login");
  await page.getByLabel("رمز الدخول").fill(code);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByRole("heading", { name: "انتهى اشتراكك، والبوت في استراحة" })).toBeVisible();
  await expect(page.getByRole("link", { name: "تواصل عبر واتساب" })).toHaveAttribute("href", "https://wa.me/4368181700732");
  const bg = await page.locator(".expired-page").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(10, 11, 13)");
});

test("rate limit: 5 wrong codes lock the login for 15 minutes", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("رمز الدخول").fill(`Wrong${i}Code2345`);
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByRole("button", { name: /دخول|متاح بعد/ })).toBeVisible();
    if (i === 3) await expect(page.getByText("تبقّت محاولة واحدة.")).toBeVisible();
  }
  await expect(page.getByText(/محاولات كثيرة متتالية. يمكنك المحاولة بعد 1[45]:\d\d\./)).toBeVisible();
  await expect(page.getByLabel("رمز الدخول")).toBeDisabled();
  await expect(page.getByRole("button", { name: /متاح بعد/ })).toBeDisabled();
});
