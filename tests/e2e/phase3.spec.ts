import { expect, test, type Browser, type Page } from "@playwright/test";
import { seedAdmin, seedClient, seedClientSession, withDb } from "./seed";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3100";
let client: Page;
let admin: Page;
let clientId = "";
let adminSession = "";
let postId = "";

async function ctxPage(browser: Browser) {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  return { ctx, page: await ctx.newPage() };
}

test.beforeAll(async ({ browser }) => {
  const a = await ctxPage(browser);
  adminSession = await seedAdmin(a.ctx, BASE);
  admin = a.page;
  const c = await seedClient(adminSession, "متجر المرحلة الثالثة");
  clientId = c.id;
  postId = await withDb(async (db) => {
    await db.query("update ig_connections set status='ok', username='phase3.shop' where client_id=$1", [clientId]);
    const { rows } = await db.query(
      "insert into ig_posts (client_id, ig_media_id, caption, media_type, posted_at) values ($1, 'e2e-m1', 'منشور العطر الجديد', 'VIDEO', now()) returning id",
      [clientId],
    );
    return rows[0].id as string;
  });
  const k = await ctxPage(browser);
  await seedClientSession(k.ctx, BASE, clientId);
  // A second device, signed in elsewhere.
  await withDb((db) =>
    db.query(
      "insert into client_sessions (client_id, token_hash, ua_hint, expires_at) values ($1, sha256(gen_random_uuid()::text::bytea), 'Safari · iOS', now() + interval '30 days')",
      [clientId],
    ),
  );
  client = k.page;
});

test("client creates a general rule with keyword chips; clashing words are refused", async () => {
  await client.goto("/replies?post=all");
  await expect(client.getByRole("heading", { name: "الردود والكلمات" })).toBeVisible();
  await expect(client.getByText("لا توجد قواعد عامة بعد")).toBeVisible();

  await client.getByRole("button", { name: "قاعدة عامة" }).click();
  const kw = client.getByLabel("إضافة كلمة مفتاحية");
  await kw.fill("سعر");
  await kw.press("Enter");
  await kw.fill("بكم");
  await kw.press(",");
  await kw.fill("السِّعر"); // different normalised word → kept
  await kw.press("Enter");
  await kw.fill("سِعر"); // same as «سعر» after normalisation → ignored
  await kw.press("Enter");
  await expect(client.locator(".kw-chip")).toHaveText(["سعر", "بكم", "السِّعر"]);
  await kw.press("Backspace"); // removes the last chip
  await expect(client.locator(".kw-chip")).toHaveCount(2);

  const save = client.getByRole("button", { name: "حفظ", exact: true });
  await expect(save).toBeDisabled(); // needs a reply or DM
  await client.getByLabel(/الرد العلني على التعليق/).fill("أرسلنا لك الأسعار في الخاص");
  await client.getByLabel("رابط المنتج أو الشراء (اختياري)").fill("http://insecure.example.com");
  await expect(client.getByText("يجب أن يبدأ الرابط بـ https://")).toBeVisible();
  await expect(save).toBeDisabled();
  await client.getByLabel("رابط المنتج أو الشراء (اختياري)").fill("https://shop.example.com/prices");
  await expect(client.locator(".dm-link")).toHaveText("shop.example.com/prices");
  await save.click();
  await expect(client.getByRole("status").filter({ hasText: "حُفظت القاعدة" })).toBeVisible();
  await expect(client.getByText("كل التغييرات محفوظة")).toBeVisible();

  // A second general rule may not reuse «سعر».
  await client.getByRole("button", { name: "قاعدة عامة" }).click();
  await kw.fill("السعر");
  await kw.press("Enter");
  await kw.fill("سعر");
  await kw.press("Enter");
  await expect(client.getByText(/«سعر» مستخدمة في قاعدة أخرى/)).toBeVisible();
  await expect(save).toBeDisabled();
});

test("a post-specific rule may reuse a general word; the post shows «البوت يعمل هنا»", async () => {
  await client.goto(`/replies?post=${postId}`);
  await client.getByRole("button", { name: "قاعدة لهذا المنشور" }).click();
  const kw = client.getByLabel("إضافة كلمة مفتاحية");
  await kw.fill("سعر");
  await kw.press("Enter");
  await client.getByLabel("الرسالة الخاصة").fill("هذا رابط الطلب");
  await expect(client.getByText(/تتقدم هذه القاعدة على القاعدة العامة لكلمة «سعر»/)).toBeVisible();
  await client.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(client.getByText("كل التغييرات محفوظة")).toBeVisible();

  await client.goto("/posts");
  const card = client.getByRole("link", { name: /إعداد ردود منشور: منشور العطر الجديد/ });
  await expect(card).toContainText("البوت يعمل هنا");
  await expect(card).toContainText("قاعدة خاصة");
});

test("cooldown change, bot switch and rule changes appear in the activity log", async () => {
  await client.goto("/replies?post=all");
  await client.getByRole("combobox").selectOption("6");
  await expect(client.getByRole("status").filter({ hasText: "حُفظ" })).toBeVisible();

  await client.goto("/dashboard");
  await expect(client.getByText("أهلًا، متجر المرحلة الثالثة")).toBeVisible();
  await expect(client.getByText("كل شيء يعمل. سأرد على التعليقات فور وصولها.")).toBeVisible();
  const sw = client.getByRole("switch", { name: "تشغيل البوت" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(client.getByText("أنا متوقف الآن بطلبك. شغّلني متى شئت.")).toBeVisible();
  await sw.click();
  await expect(client.getByText("كل شيء يعمل. سأرد على التعليقات فور وصولها.")).toBeVisible();

  await client.goto("/activity?range=1");
  for (const t of ["أضفتَ قاعدة جديدة «سعر»، «بكم»", "صار منع التكرار: ردّ واحد لكل شخص كل 6 ساعات", "أوقفتَ البوت", "شغّلتَ البوت"]) {
    await expect(client.getByText(t).first()).toBeVisible();
  }
  await client.getByRole("tab", { name: "تحتاج انتباهك" }).click();
  await expect(client.getByText("لا أحداث في هذه الفترة")).toBeVisible();
});

test("account: lists devices and ends the other session", async () => {
  await client.goto("/settings");
  await expect(client.getByText("هذا الجهاز")).toBeVisible();
  const before = await client.getByTestId("device").count();
  expect(before).toBeGreaterThanOrEqual(2);
  await client.getByRole("button", { name: "إنهاء الجلسات الأخرى" }).click();
  await expect(client.getByTestId("device")).toHaveCount(1);
});

test("admin emergency stop pauses every bot and the client sees it", async () => {
  await admin.goto("/admin/bots");
  const row = admin.getByTestId("bot-row").filter({ hasText: "متجر المرحلة الثالثة" });
  await expect(row).toContainText("يعمل");
  await admin.getByRole("button", { name: "إيقاف كل البوتات" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "إيقاف الكل" }).click();
  await expect(admin.getByRole("alert").filter({ hasText: "كل البوتات متوقفة الآن بأمر منك" })).toBeVisible();
  await expect(row).toContainText("متوقف: إيقاف شامل");

  await client.goto("/dashboard");
  await expect(client.getByText("أنا متوقف مؤقتًا من فريق KHATIB، وسأعود للعمل فور انتهاء الصيانة.")).toBeVisible();

  await admin.getByRole("button", { name: "استئناف كل البوتات" }).click();
  await expect(row).toContainText("يعمل");
});

test("admin renews from the subscriptions page; the audit log records it", async () => {
  await admin.goto("/admin/subscriptions");
  const row = admin.getByTestId("sub-row").filter({ hasText: "متجر المرحلة الثالثة" });
  await expect(row).toContainText("30 / 30 يومًا");
  await row.getByRole("button", { name: "تجديد 30 يومًا" }).click();
  await admin.getByRole("dialog").getByRole("textbox").fill("دفع نقدي");
  await admin.getByRole("button", { name: "تأكيد التجديد" }).click();
  await expect(row).toContainText("60 / 60 يومًا");

  await admin.goto("/admin/audit");
  await admin.getByLabel("بحث في السجل").fill("المرحلة الثالثة");
  const first = admin.getByTestId("audit-row").first();
  await expect(first).toContainText("جُدّد الاشتراك 30 يومًا");
  await expect(first).toContainText("«دفع نقدي»");
  await admin.getByRole("tab", { name: "أمان" }).click();
  await expect(admin.getByTestId("audit-row").filter({ hasText: "المرحلة الثالثة" })).toHaveCount(0);

  // The client sees the renewal, never the payment note.
  await client.goto("/activity?range=1");
  await expect(client.getByText(/جُدّد اشتراكك حتى/)).toBeVisible();
  await expect(client.locator("body")).not.toContainText("دفع نقدي");
});

test("expired subscription: rules are read-only", async () => {
  await withDb((db) => db.query("update subscriptions set starts_on = starts_on - 90, ends_on = ends_on - 90 where client_id = $1", [clientId]));
  await client.goto("/replies?post=all");
  await expect(client.getByText("اشتراكك منتهٍ: يمكنك عرض ردودك المحفوظة فقط")).toBeVisible();
  await expect(client.getByRole("button", { name: "قاعدة عامة" })).toHaveCount(0);
  await expect(client.getByRole("button", { name: "حفظ", exact: true })).toHaveCount(0);
  await expect(client.locator(".kw-chip").first()).toBeVisible();
  await client.goto("/dashboard");
  await expect(client.getByRole("heading", { name: "انتهى اشتراكك، والبوت في استراحة" })).toBeVisible();
});
