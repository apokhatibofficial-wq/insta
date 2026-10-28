import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_CRON_SECRET, E2E_META_SECRET, MOCK_META } from "../../playwright.config";
import { seedAdmin, seedClient, seedClientSession, withDb } from "./seed";

// Instagram end to end against a local mock of Meta's endpoints:
// connect (OAuth) → posts synced → signed webhook → private + public replies.
test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3100";
const IG = "17841400000000001";
let client: Page;
let clientId = "";

type Call = { method: string; path: string; query: Record<string, string>; body: string; auth: string };
const calls = async (r: APIRequestContext): Promise<Call[]> => (await r.get(`${MOCK_META}/__calls`)).json();
const resetCalls = (r: APIRequestContext) => r.delete(`${MOCK_META}/__calls`);

function signed(payload: unknown, secret = E2E_META_SECRET) {
  const body = JSON.stringify(payload);
  return { body, sig: "sha256=" + createHmac("sha256", secret).update(body).digest("hex") };
}
const comment = (id: string, from: string, text: string, media = "18000000000000001") => ({
  object: "instagram",
  entry: [{ id: IG, time: 1, field: "comments", value: { id, from: { id: from, username: `user_${from}` }, media: { id: media, media_product_type: "FEED" }, text } }],
});
async function sendWebhook(r: APIRequestContext, payload: unknown, sig?: string) {
  const s = signed(payload);
  return r.post(`${BASE}/api/webhooks/meta`, { data: s.body, headers: { "content-type": "application/json", "x-hub-signature-256": sig ?? s.sig } });
}
async function waitForCalls(r: APIRequestContext, pred: (c: Call[]) => boolean) {
  await expect.poll(async () => pred(await calls(r)), { timeout: 10_000 }).toBe(true);
}

test.beforeAll(async ({ browser }) => {
  const a = await browser.newContext();
  const adminSession = await seedAdmin(a, BASE);
  const c = await seedClient(adminSession, "متجر إنستغرام");
  clientId = c.id;
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  await seedClientSession(ctx, BASE, clientId);
  client = await ctx.newPage();
});

test("webhook verification handshake", async ({ request }) => {
  const ok = await request.get(`${BASE}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=e2e-verify-token-0123456789&hub.challenge=12345`);
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toBe("12345");
  const bad = await request.get(`${BASE}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`);
  expect(bad.status()).toBe(403);
});

test("client connects Instagram through Meta login; token stored encrypted; posts synced", async ({ request }) => {
  await resetCalls(request);
  await client.goto("/dashboard");
  await expect(client.getByRole("heading", { name: "اربط حساب إنستغرام" })).toBeVisible();
  await client.getByRole("link", { name: "ربط حساب إنستغرام" }).click();
  await expect(client).toHaveURL(/\/dashboard\?ig=connected$/);
  await expect(client.getByText("رُبط حساب إنستغرام بنجاح. البوت جاهز للعمل.")).toBeVisible();
  await expect(client.getByText("@mock.shop", { exact: true })).toBeVisible();

  const c = await calls(request);
  const authorize = c.find((x) => x.path === "/oauth/authorize")!;
  expect(authorize.query).toMatchObject({ client_id: "1234567890", response_type: "code" });
  expect(authorize.query.scope).toBe("instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages");
  expect(authorize.query.state?.length ?? 0).toBeGreaterThan(20);
  expect(c.some((x) => x.path.endsWith(`/${IG}/subscribed_apps`) && x.method === "POST")).toBe(true);

  const row = await withDb(async (db) => (await db.query("select ig_user_id, status, token_ciphertext from ig_connections where client_id=$1", [clientId])).rows[0]);
  expect(row.ig_user_id).toBe(IG);
  expect(row.status).toBe("ok");
  expect(Buffer.from(row.token_ciphertext).toString("utf8")).not.toContain("LONG_TOKEN");

  await client.goto("/posts");
  await expect(client.getByRole("link", { name: /إعداد ردود منشور: عطر الياسمين الجديد/ })).toBeVisible();
});

test("a replayed OAuth callback (stale state) is refused", async () => {
  await client.goto("/connect/instagram/callback?code=mock-code&state=forged-state-value-xxxxxxxx");
  await expect(client).toHaveURL(/\/dashboard\?ig=state$/);
  await expect(client.getByText("انتهت مهلة طلب الربط")).toBeVisible();
});

test("matching comment → private reply with link + public reply; activity shows it", async ({ request }) => {
  // A rule for the synced post, created through the editor.
  const postId = await withDb(async (db) => (await db.query("select id from ig_posts where ig_media_id='18000000000000001'")).rows[0].id as string);
  await client.goto(`/replies?post=${postId}`);
  await client.getByRole("button", { name: "قاعدة لهذا المنشور" }).click();
  const kw = client.getByLabel("إضافة كلمة مفتاحية");
  await kw.fill("سعر");
  await kw.press("Enter");
  await client.getByLabel(/الرد العلني على التعليق/).fill("أرسلنا لك التفاصيل في الخاص");
  await client.getByLabel("الرسالة الخاصة").fill("أهلًا! هذا رابط الطلب:");
  await client.getByLabel("رابط المنتج أو الشراء (اختياري)").fill("https://shop.example.com/jasmine");
  await client.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(client.getByText("كل التغييرات محفوظة")).toBeVisible();

  await resetCalls(request);
  const r = await sendWebhook(request, comment("c-100", "u1", "بكم السِّعر؟"));
  expect(r.status()).toBe(200);
  await waitForCalls(request, (c) => c.some((x) => x.path.endsWith("/c-100/replies")) && c.some((x) => x.path.endsWith(`/${IG}/messages`)));
  const c = await calls(request);
  const dm = JSON.parse(c.find((x) => x.path.endsWith(`/${IG}/messages`))!.body);
  expect(dm).toEqual({ recipient: { comment_id: "c-100" }, message: { text: "أهلًا! هذا رابط الطلب:\nhttps://shop.example.com/jasmine" } });
  expect(JSON.parse(c.find((x) => x.path.endsWith("/c-100/replies"))!.body)).toEqual({ message: "أرسلنا لك التفاصيل في الخاص" });
  expect(c.every((x) => x.auth === "bearer" || !x.path.startsWith("/v"))).toBe(true);

  await client.goto("/activity?range=1");
  await expect(client.getByText(/ردّ على التعليق وأرسل رسالة خاصة مع الرابط: «بكم السِّعر؟» من @user_u1/)).toBeVisible();
});

test("duplicate deliveries are answered once; the same person is throttled by the cooldown", async ({ request }) => {
  await resetCalls(request);
  await sendWebhook(request, comment("c-100", "u1", "بكم السعر؟")); // Meta retry of the same comment
  await sendWebhook(request, comment("c-101", "u1", "السعر لو سمحت")); // same person, within cooldown
  await new Promise((r) => setTimeout(r, 1500));
  expect((await calls(request)).filter((x) => x.method === "POST")).toHaveLength(0);
  await client.goto("/activity?range=1");
  await expect(client.getByText(/تجاهل تعليقًا من @user_u1 لأنه تلقّى ردًا خلال آخر 24 ساعة/)).toBeVisible();
});

test("invalid signatures are rejected with 401 and nothing is sent", async ({ request }) => {
  await resetCalls(request);
  const r = await sendWebhook(request, comment("c-200", "u9", "سعر"), "sha256=" + "0".repeat(64));
  expect(r.status()).toBe(401);
  const forged = signed(comment("c-201", "u9", "سعر"), "not-the-app-secret-000000");
  const r2 = await request.post(`${BASE}/api/webhooks/meta`, { data: forged.body, headers: { "x-hub-signature-256": forged.sig, "content-type": "application/json" } });
  expect(r2.status()).toBe(401);
  await new Promise((res) => setTimeout(res, 800));
  expect(await calls(request)).toHaveLength(0);
});

test("the account's own comments and non-matching comments are ignored", async ({ request }) => {
  await resetCalls(request);
  await sendWebhook(request, comment("c-300", IG, "السعر")); // the account itself (incl. the bot's own replies)
  await sendWebhook(request, comment("c-301", "u5", "منتج رائع"));
  await new Promise((r) => setTimeout(r, 1500));
  expect((await calls(request)).filter((x) => x.method === "POST")).toHaveLength(0);
});

test("a refused private message is reported with the public reply still sent", async ({ request }) => {
  await resetCalls(request);
  await sendWebhook(request, comment("c-dmfail", "u7", "السعر"));
  await waitForCalls(request, (c) => c.some((x) => x.path.endsWith("/c-dmfail/replies")));
  await client.goto("/activity?range=1");
  await client.getByRole("tab", { name: "تحتاج انتباهك" }).click();
  await expect(client.getByText("تعذّر إرسال رسالة خاصة إلى @user_u7")).toBeVisible();
  await expect(client.getByText(/اكتفى البوت بالرد العلني/)).toBeVisible();
});

test("expired subscription: webhooks are ignored", async ({ request }) => {
  await withDb((db) => db.query("update subscriptions set starts_on = starts_on - 40, ends_on = ends_on - 40 where client_id = $1", [clientId]));
  await resetCalls(request);
  await sendWebhook(request, comment("c-400", "u8", "السعر"));
  await new Promise((r) => setTimeout(r, 1500));
  expect((await calls(request)).filter((x) => x.method === "POST")).toHaveLength(0);
  await withDb((db) => db.query("update subscriptions set starts_on = starts_on + 40, ends_on = ends_on + 40 where client_id = $1", [clientId]));
});

test("daily job: requires the cron secret; refreshes due tokens", async ({ request }) => {
  expect((await request.post(`${BASE}/api/jobs/daily`)).status()).toBe(401);
  expect((await request.post(`${BASE}/api/jobs/daily`, { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  await withDb((db) => db.query("update ig_connections set token_expires_at = now() + interval '3 days', updated_at = now() - interval '2 days' where client_id = $1", [clientId]));
  await resetCalls(request);
  const r = await request.post(`${BASE}/api/jobs/daily`, { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.tokens.refreshed).toBe(1);
  expect((await calls(request)).some((x) => x.path === "/refresh_access_token")).toBe(true);
});

test("disconnect unsubscribes at Meta, deletes the token and keeps the rules", async ({ request }) => {
  await resetCalls(request);
  await client.goto("/settings");
  await client.getByRole("button", { name: "فصل الحساب" }).click();
  await client.getByRole("dialog").getByRole("button", { name: "فصل الحساب" }).click();
  await expect(client.getByText("لا يوجد حساب مربوط. البوت متوقف.")).toBeVisible();
  expect((await calls(request)).some((x) => x.method === "DELETE" && x.path.endsWith(`/${IG}/subscribed_apps`))).toBe(true);
  const row = await withDb(async (db) => (await db.query("select status, token_ciphertext from ig_connections where client_id=$1", [clientId])).rows[0]);
  expect(row).toEqual({ status: "none", token_ciphertext: null });
  const rules = await withDb(async (db) => (await db.query("select count(*)::int n from rules where client_id=$1", [clientId])).rows[0].n);
  expect(rules).toBe(1);
});
