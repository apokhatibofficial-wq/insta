import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, h, login, makeAdmin, makeClient, raw, rnd } from "./helpers";

type Decision = { action: "reply" | "skip" | "ignore"; reason?: string; rule_id?: string; public_reply?: string; dm_text?: string; keyword?: string };

let admin: Awaited<ReturnType<typeof makeAdmin>>;
beforeAll(async () => {
  admin = await makeAdmin();
});
afterAll(async () => {
  await db.end();
  await raw.end();
});

let seq = 1000n;
const igId = () => String(17840000000000000n + seq++);

/** A connected client with an IG account id, ready to automate. */
async function connected() {
  const c = await makeClient(admin.session);
  const ig = igId();
  await db.service("client_ig_connect", {
    p_client_id: c.id,
    p_ig_user_id: ig,
    p_username: "shop",
    p_token_ciphertext: "\\x0102",
    p_token_iv: "\\x0304",
    p_token_expires_at: new Date(Date.now() + 50 * 86400_000).toISOString(),
  });
  return { ...c, ig };
}

async function post(clientId: string, mediaId: string) {
  const { rows } = await raw.query("insert into ig_posts (client_id, ig_media_id, caption) values ($1, $2, 'منشور') returning id", [clientId, mediaId]);
  return rows[0].id as string;
}

const rule = (clientId: string, scope: "all" | "posts", kw: string[], reply: string, posts: string[] = []) =>
  db.asClient<{ ok: boolean; rule: { id: string } }>(clientId, "client_rule_save", {
    p_id: null,
    p_enabled: true,
    p_scope: scope,
    p_post_ids: posts,
    p_keywords: kw,
    p_public_reply: reply,
    p_dm_text: "رسالة",
    p_link_url: "",
  });

const decide = (account: string, media: string, from: string, text: string) =>
  db.service<Decision>("automation_decide", {
    p_account_id: account,
    p_media_id: media,
    p_from_id: from,
    p_from_username: "follower",
    p_comment_id: rnd(),
    p_text: text,
  });

describe("automation_decide", () => {
  it("matches normalised keywords as substrings; ignores non-matching comments", async () => {
    const c = await connected();
    await rule(c.id, "all", ["سعر"], "عام");
    expect(await decide(c.ig, "m1", "u1", "بكم السِّعرُ؟")).toMatchObject({ action: "reply", public_reply: "عام", keyword: "سعر" });
    expect(await decide(c.ig, "m1", "u2", "منتج جميل")).toMatchObject({ action: "ignore", reason: "no_match" });
  });

  it("a post-specific rule wins over a general rule on its post only", async () => {
    const c = await connected();
    const media = `m${rnd()}`.replace(/[^0-9a-z]/gi, "");
    const p = await post(c.id, media);
    await rule(c.id, "all", ["سعر"], "عام");
    await rule(c.id, "posts", ["سعر"], "خاص", [p]);
    expect(await decide(c.ig, media, "u1", "السعر؟")).toMatchObject({ action: "reply", public_reply: "خاص" });
    expect(await decide(c.ig, "other-media", "u2", "السعر؟")).toMatchObject({ action: "reply", public_reply: "عام" });
  });

  it("never answers the account's own comments, unknown accounts, or blocked clients", async () => {
    const c = await connected();
    await rule(c.id, "all", ["سعر"], "عام");
    expect(await decide(c.ig, "m", c.ig, "سعر")).toMatchObject({ action: "ignore", reason: "own" });
    expect(await decide("99999999999", "m", "u", "سعر")).toMatchObject({ action: "ignore", reason: "unknown_account" });
    await db.service("admin_bot_set_allowed", { p_session_hash: admin.session, p_client_id: c.id, p_allowed: false });
    expect(await decide(c.ig, "m", "u", "سعر")).toMatchObject({ action: "ignore", reason: "blocked" });
    await db.service("admin_bot_set_allowed", { p_session_hash: admin.session, p_client_id: c.id, p_allowed: true });
    await raw.query("update subscriptions set starts_on = starts_on - 40, ends_on = ends_on - 40 where client_id = $1", [c.id]);
    expect(await decide(c.ig, "m", "u", "سعر")).toMatchObject({ action: "ignore", reason: "blocked" });
  });

  it("applies the per-person cooldown and logs the skip", async () => {
    const c = await connected();
    await rule(c.id, "all", ["سعر"], "عام");
    expect((await decide(c.ig, "m", "u1", "سعر")).action).toBe("reply");
    expect(await decide(c.ig, "m", "u1", "سعر؟")).toMatchObject({ action: "skip", reason: "cooldown" });
    expect((await decide(c.ig, "m", "u2", "سعر")).action).toBe("reply"); // another person
    await raw.query("update reply_ledger set last_reply_at = now() - interval '25 hours' where client_id = $1 and ig_user_id = 'u1'", [c.id]);
    expect((await decide(c.ig, "m", "u1", "سعر")).action).toBe("reply");
    const { rows } = await raw.query("select count(*)::int n from events where client_id = $1 and code = 'reply.cooldown'", [c.id]);
    expect(rows[0].n).toBe(1);
  });

  it("disabled rules never match", async () => {
    const c = await connected();
    const r = await rule(c.id, "all", ["سعر"], "عام");
    await raw.query("update rules set enabled = false where id = $1", [r.rule.id]);
    expect(await decide(c.ig, "m", "u1", "سعر")).toMatchObject({ action: "ignore", reason: "no_match" });
  });
});

describe("connection, tokens and OAuth state", () => {
  it("one Instagram account can belong to one client only", async () => {
    const a = await connected();
    const b = await makeClient(admin.session);
    await expect(
      db.service("client_ig_connect", { p_client_id: b.id, p_ig_user_id: a.ig, p_username: "x", p_token_ciphertext: "\\x01", p_token_iv: "\\x02", p_token_expires_at: null }),
    ).rejects.toThrow("ig_account_in_use");
  });

  it("a rejected token stops the bot and asks the client to reconnect", async () => {
    const c = await connected();
    await raw.query("update bot_settings set client_enabled = true where client_id = $1", [c.id]);
    expect(await db.service("can_automate", { p_client_id: c.id })).toBe(true);
    await db.service("ig_mark_needs_reconnect", { p_client_id: c.id });
    expect(await db.service("can_automate", { p_client_id: c.id })).toBe(false);
    const { rows } = await raw.query("select status, token_ciphertext from ig_connections where client_id = $1", [c.id]);
    expect(rows[0]).toEqual({ status: "needs_reconnect", token_ciphertext: null });
  });

  it("OAuth state is single-use and bound to the session that created it", async () => {
    const c = await makeClient(admin.session);
    const s1 = await login(c.codeHash);
    const s2 = await login(c.codeHash);
    const state = await h(rnd());
    expect(await db.service("oauth_state_create", { p_session_hash: s1.sessionHash, p_state_hash: state })).toBe(c.id);
    expect(await db.service("oauth_state_consume", { p_session_hash: s2.sessionHash, p_state_hash: state })).toBeNull();
    expect(await db.service("oauth_state_consume", { p_session_hash: s1.sessionHash, p_state_hash: state })).toBe(c.id);
    expect(await db.service("oauth_state_consume", { p_session_hash: s1.sessionHash, p_state_hash: state })).toBeNull();
    const old = await h(rnd());
    await db.service("oauth_state_create", { p_session_hash: s1.sessionHash, p_state_hash: old });
    await raw.query("update oauth_states set expires_at = now() - interval '1 second' where state_hash = $1", [old]);
    expect(await db.service("oauth_state_consume", { p_session_hash: s1.sessionHash, p_state_hash: old })).toBeNull();
  });

  it("webhook keys are processed once", async () => {
    const k = `comment:${rnd()}`;
    expect(await db.service("webhook_first_seen", { p_key: k })).toBe(true);
    expect(await db.service("webhook_first_seen", { p_key: k })).toBe(false);
  });

  it("media sync upserts posts for the right tenant only", async () => {
    const a = await connected();
    const b = await connected();
    const items = [{ id: "1790000000001", caption: "أ", media_type: "IMAGE", timestamp: "2026-10-01T10:00:00+0000", comments_count: 3 }];
    expect(await db.service("ig_posts_upsert", { p_client_id: a.id, p_items: items })).toBe(1);
    // Same media id pushed for another tenant: does not take it over.
    await db.service("ig_posts_upsert", { p_client_id: b.id, p_items: [{ ...items[0], caption: "سرقة" }] });
    const { rows } = await raw.query("select client_id, caption from ig_posts where ig_media_id = '1790000000001'");
    expect(rows).toEqual([{ client_id: a.id, caption: "أ" }]);
  });

  it("DM text + link must fit Meta's 1000-byte limit (Arabic = 2 bytes per letter)", async () => {
    const c = await connected();
    const ok = await db.asClient<{ ok: boolean }>(c.id, "client_rule_save", {
      p_id: null, p_enabled: true, p_scope: "all", p_post_ids: [], p_keywords: ["ا"], p_public_reply: "", p_dm_text: "ب".repeat(480), p_link_url: "https://a.example.com/x",
    });
    expect(ok.ok).toBe(true);
    await expect(
      db.asClient(c.id, "client_rule_save", {
        p_id: null, p_enabled: true, p_scope: "all", p_post_ids: [], p_keywords: ["ج"], p_public_reply: "", p_dm_text: "ب".repeat(501), p_link_url: "",
      }),
    ).rejects.toThrow("invalid_input");
  });
});
