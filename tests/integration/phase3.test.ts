import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeKeyword } from "@/lib/keywords";
import { SAMPLES } from "../unit/keywords.test";
import { db, h, login, makeAdmin, makeClient, raw, rnd } from "./helpers";

type Save = { ok: boolean; error?: string; words?: string[]; rule?: { id: string; keywords: string[]; post_ids: string[] } };

let admin: Awaited<ReturnType<typeof makeAdmin>>;
beforeAll(async () => {
  admin = await makeAdmin();
});
afterAll(async () => {
  await db.end();
  await raw.end();
});

async function post(clientId: string, caption = "منشور") {
  const { rows } = await raw.query(
    "insert into ig_posts (client_id, ig_media_id, caption, posted_at) values ($1, $2, $3, now()) returning id",
    [clientId, `m-${rnd()}`, caption],
  );
  return rows[0].id as string;
}

const save = (clientId: string, r: { id?: string; scope: "all" | "posts"; posts?: string[]; kw: string[]; reply?: string; dm?: string; link?: string; enabled?: boolean }) =>
  db.asClient<Save>(clientId, "client_rule_save", {
    p_id: r.id ?? null,
    p_enabled: r.enabled ?? true,
    p_scope: r.scope,
    p_post_ids: r.posts ?? [],
    p_keywords: r.kw,
    p_public_reply: r.reply ?? "رد",
    p_dm_text: r.dm ?? "",
    p_link_url: r.link ?? "",
  });

async function asAuth(clientId: string, sql: string, params: unknown[] = []) {
  const c = await raw.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", client_id: clientId })]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

describe("keyword normalisation: SQL and TypeScript agree", () => {
  it.each(SAMPLES)("%s", async (input) => {
    const { rows } = await raw.query("select app_private.norm_keyword($1) as n", [input]);
    expect(rows[0].n).toBe(normalizeKeyword(input));
  });
});

describe("rules & keyword scopes", () => {
  it("general rules: a word may belong to only one general rule", async () => {
    const c = await makeClient(admin.session);
    const a = await save(c.id, { scope: "all", kw: ["سعر", "بكم", "سِعر"] });
    expect(a.ok).toBe(true);
    expect(a.rule!.keywords).toEqual(["سعر", "بكم"]); // deduped by normalised form
    const b = await save(c.id, { scope: "all", kw: ["السعر", "سعر"] });
    expect(b).toMatchObject({ ok: false, error: "keyword_clash", words: ["سعر"] });
  });

  it("post-specific rules may reuse a general word (they take precedence on that post)", async () => {
    const c = await makeClient(admin.session);
    const p1 = await post(c.id);
    const p2 = await post(c.id);
    expect((await save(c.id, { scope: "all", kw: ["سعر"] })).ok).toBe(true);
    expect((await save(c.id, { scope: "posts", posts: [p1], kw: ["سعر"] })).ok).toBe(true);
    // Same word on another post: allowed. On the same post: clash.
    expect((await save(c.id, { scope: "posts", posts: [p2], kw: ["سعر"] })).ok).toBe(true);
    expect(await save(c.id, { scope: "posts", posts: [p1, p2], kw: ["سعر"] })).toMatchObject({ ok: false, error: "keyword_clash" });
  });

  it("updating a rule replaces its words and posts; an existing rule does not clash with itself", async () => {
    const c = await makeClient(admin.session);
    const p1 = await post(c.id);
    const r = await save(c.id, { scope: "posts", posts: [p1], kw: ["عود"] });
    const u = await save(c.id, { id: r.rule!.id, scope: "all", kw: ["عود", "oud"], dm: "رسالة", link: "https://shop.example.com/oud" });
    expect(u.ok).toBe(true);
    expect(u.rule).toMatchObject({ keywords: ["عود", "oud"], post_ids: [] });
  });

  it("validation: needs a word and a reply or DM, https links, ≤1000 chars, at least one post when specific", async () => {
    const c = await makeClient(admin.session);
    const bad = [
      { scope: "all" as const, kw: [] },
      { scope: "all" as const, kw: ["x"], reply: "", dm: "" },
      { scope: "all" as const, kw: ["x"], link: "http://insecure.example.com" },
      { scope: "all" as const, kw: ["x"], dm: "ا".repeat(1001) },
      { scope: "posts" as const, posts: [], kw: ["x"] },
    ];
    for (const b of bad) await expect(save(c.id, b)).rejects.toThrow("invalid_input");
  });

  it("cannot attach another tenant's post, nor see or edit another tenant's rules", async () => {
    const A = await makeClient(admin.session);
    const B = await makeClient(admin.session);
    const pB = await post(B.id);
    await expect(save(A.id, { scope: "posts", posts: [pB], kw: ["x"] })).rejects.toThrow("invalid_input");
    const rB = await save(B.id, { scope: "all", kw: ["خاص"] });
    await expect(save(A.id, { id: rB.rule!.id, scope: "all", kw: ["خاص"] })).rejects.toThrow("not_found");
    await expect(db.asClient(A.id, "client_rule_delete", { p_id: rB.rule!.id })).rejects.toThrow("not_found");
    const got = await db.asClient<{ rules: unknown[] }>(A.id, "client_rules_get");
    expect(got.rules).toHaveLength(0);
  });

  it("the commit-time trigger blocks clashes written by any other path", async () => {
    const c = await makeClient(admin.session);
    await save(c.id, { scope: "all", kw: ["توصيل"] });
    const [r] = await asAuth(c.id, "insert into public.rules (client_id, scope, dm_text) values ($1, 'all', 'x') returning id", [c.id]);
    await expect(
      asAuth(c.id, "insert into public.rule_keywords (rule_id, client_id, keyword, keyword_norm) values ($1, $2, 'التوصيل', '')", [r!.id, c.id]),
    ).resolves.toBeDefined(); // different normalised word — fine
    await expect(
      asAuth(c.id, "insert into public.rule_keywords (rule_id, client_id, keyword, keyword_norm) values ($1, $2, 'تَوصيل', 'anything')", [r!.id, c.id]),
    ).rejects.toThrow("keyword_clash");
  });

  it("expired subscription ⇒ read-only (rules, cooldown, bot switch)", async () => {
    const c = await makeClient(admin.session);
    const r = await save(c.id, { scope: "all", kw: ["سعر"] });
    await raw.query("update subscriptions set starts_on = starts_on - 40, ends_on = ends_on - 40 where client_id = $1", [c.id]);
    await expect(save(c.id, { id: r.rule!.id, scope: "all", kw: ["سعر"] })).rejects.toThrow("read_only");
    await expect(db.asClient(c.id, "client_rule_delete", { p_id: r.rule!.id })).rejects.toThrow("read_only");
    await expect(db.asClient(c.id, "client_set_cooldown", { p_hours: 6 })).rejects.toThrow("read_only");
    await expect(db.asClient(c.id, "client_set_bot_enabled", { p_enabled: true })).rejects.toThrow("read_only");
    const got = await db.asClient<{ can_edit: boolean; rules: unknown[] }>(c.id, "client_rules_get");
    expect(got).toMatchObject({ can_edit: false });
    expect(got.rules).toHaveLength(1);
  });
});

describe("events", () => {
  it("client changes write 'set' events; clients cannot forge other events", async () => {
    const c = await makeClient(admin.session);
    const other = await makeClient(admin.session);
    await save(c.id, { scope: "all", kw: ["سعر"] });
    await db.asClient(c.id, "client_set_cooldown", { p_hours: 6 });
    await db.asClient(c.id, "client_set_bot_enabled", { p_enabled: false });
    const ev = await db.asClient<{ code: string }[]>(c.id, "client_activity", { p_days: 1 });
    expect(ev.map((e) => e.code)).toEqual(expect.arrayContaining(["rule.created", "cooldown.changed", "bot.off"]));
    await expect(asAuth(c.id, "insert into public.events (client_id, kind, code) values ($1, 'reply', 'x')", [c.id])).rejects.toThrow(/row-level security/);
    await expect(asAuth(c.id, "insert into public.events (client_id, kind, code) values ($1, 'set', 'x')", [other.id])).rejects.toThrow(/row-level security/);
  });

  it("admin lifecycle actions appear in the client's activity", async () => {
    const c = await makeClient(admin.session);
    await db.service("admin_subscription_renew", { p_session_hash: admin.session, p_client_id: c.id, p_note: "دُفع" });
    await db.service("admin_bot_set_allowed", { p_session_hash: admin.session, p_client_id: c.id, p_allowed: false });
    const ev = await db.asClient<{ code: string; data: Record<string, unknown> }[]>(c.id, "client_activity", { p_days: 1 });
    expect(ev.map((e) => e.code)).toEqual(expect.arrayContaining(["subscription.renewed", "automation.blocked"]));
    // The payment note is never shown to the client.
    expect(JSON.stringify(ev)).not.toContain("دُفع");
  });
});

describe("client account: devices & Instagram", () => {
  it("lists own sessions, ends one or all others, never the current one", async () => {
    const c = await makeClient(admin.session);
    const s1 = await login(c.codeHash);
    const s2 = await login(c.codeHash);
    const s3 = await login(c.codeHash);
    const list = await db.service<{ id: string; current: boolean }[]>("client_devices", { p_session_hash: s1.sessionHash });
    expect(list).toHaveLength(3);
    expect(list[0]!.current).toBe(true);
    await db.service("client_devices_end", { p_session_hash: s1.sessionHash, p_session_id: list[1]!.id });
    expect(await db.service<unknown[]>("client_devices", { p_session_hash: s1.sessionHash })).toHaveLength(2);
    // Trying to end the current session by id is a no-op.
    await db.service("client_devices_end", { p_session_hash: s1.sessionHash, p_session_id: list[0]!.id });
    expect(await db.service<unknown[]>("client_devices", { p_session_hash: s1.sessionHash })).toHaveLength(2);
    await db.service("client_devices_end", { p_session_hash: s1.sessionHash, p_session_id: null });
    expect(await db.service<unknown[]>("client_devices", { p_session_hash: s1.sessionHash })).toHaveLength(1);
    await expect(db.service("client_devices", { p_session_hash: s3.sessionHash })).rejects.toThrow("client_auth_required");
    void s2;
  });

  it("a session can only see its own tenant's devices", async () => {
    const A = await makeClient(admin.session);
    const B = await makeClient(admin.session);
    const sA = await login(A.codeHash);
    const sB = await login(B.codeHash);
    const listB = await db.service<{ id: string }[]>("client_devices", { p_session_hash: sB.sessionHash });
    await db.service("client_devices_end", { p_session_hash: sA.sessionHash, p_session_id: listB[0]!.id });
    expect(await db.service<unknown[]>("client_devices", { p_session_hash: sB.sessionHash })).toHaveLength(1);
  });

  it("disconnecting Instagram deletes the token and keeps the rules", async () => {
    const c = await makeClient(admin.session);
    await save(c.id, { scope: "all", kw: ["سعر"] });
    await raw.query("update ig_connections set status='ok', username='shop', token_ciphertext='\\x0102', token_iv='\\x03' where client_id=$1", [c.id]);
    const s = await login(c.codeHash);
    await db.service("client_ig_disconnect", { p_session_hash: s.sessionHash });
    const { rows } = await raw.query("select status, token_ciphertext, username from ig_connections where client_id=$1", [c.id]);
    expect(rows[0]).toEqual({ status: "none", token_ciphertext: null, username: null });
    const got = await db.asClient<{ rules: unknown[] }>(c.id, "client_rules_get");
    expect(got.rules).toHaveLength(1);
  });
});

describe("admin: bots, audit log, global stop", () => {
  it("global emergency stop blocks every bot until resumed, and is audited", async () => {
    const c = await makeClient(admin.session);
    await raw.query("update ig_connections set status='ok' where client_id=$1", [c.id]);
    expect(await db.service("can_automate", { p_client_id: c.id })).toBe(true);
    await db.service("admin_global_stop_set", { p_session_hash: admin.session, p_stop: true });
    expect(await db.service("can_automate", { p_client_id: c.id })).toBe(false);
    const bots = await db.service<{ global_stop: boolean; bots: { id: string; bot_state: string }[] }>("admin_bots_list", { p_session_hash: admin.session });
    expect(bots.global_stop).toBe(true);
    expect(bots.bots.find((b) => b.id === c.id)!.bot_state).toBe("global");
    const dash = await db.asClient<{ global_stop: boolean }>(c.id, "client_dashboard");
    expect(dash.global_stop).toBe(true);
    await db.service("admin_global_stop_set", { p_session_hash: admin.session, p_stop: false });
    expect(await db.service("can_automate", { p_client_id: c.id })).toBe(true);
    const log = await db.service<{ action: string }[]>("admin_audit_list", { p_session_hash: admin.session });
    expect(log.slice(0, 2).map((l) => l.action)).toEqual(["automation.global_resume", "automation.global_stop"]);
  });

  it("bots/audit lists require an admin session", async () => {
    for (const fn of ["admin_bots_list", "admin_audit_list"]) {
      await expect(db.service(fn, { p_session_hash: await h("nope") })).rejects.toThrow("admin_auth_required");
    }
    await expect(db.service("admin_global_stop_set", { p_session_hash: await h("nope"), p_stop: true })).rejects.toThrow("admin_auth_required");
  });

  it("clients cannot read or change the global stop", async () => {
    const c = await makeClient(admin.session);
    await expect(asAuth(c.id, "update public.app_settings set global_stop = false")).rejects.toThrow(/permission denied/);
  });
});

describe("daily maintenance: expiry and 180-day retention", () => {
  const shift = (id: string, days: number) =>
    raw.query("update subscriptions set starts_on = starts_on - $2::int, ends_on = ends_on - $2::int where client_id = $1", [id, days]);
  const run = () => db.service<{ expired: number; warned: number; archived: number }>("run_daily_maintenance");

  it("on expiry: deletes the IG token and tells the client, once", async () => {
    const c = await makeClient(admin.session);
    await raw.query("update ig_connections set status='ok', token_ciphertext='\\x01' where client_id=$1", [c.id]);
    await shift(c.id, 31);
    await run();
    const { rows } = await raw.query("select status, token_ciphertext from ig_connections where client_id=$1", [c.id]);
    expect(rows[0]).toEqual({ status: "none", token_ciphertext: null });
    await run();
    const { rows: ev } = await raw.query("select count(*)::int n from events where client_id=$1 and code='subscription.expired'", [c.id]);
    expect(ev[0].n).toBe(1);
  });

  it("warns 7 days before deletion; deletes tenant data after 180 days, keeps the client row and audit log", async () => {
    const c = await makeClient(admin.session);
    const keep = await makeClient(admin.session); // active: must be untouched
    const p = await post(c.id);
    await save(c.id, { scope: "posts", posts: [p], kw: ["سعر"] });
    await login(c.codeHash);
    await shift(c.id, 29 + 174); // last day was 174 days ago
    await run();
    const { rows: w } = await raw.query("select count(*)::int n from events where client_id=$1 and code='retention.warning'", [c.id]);
    expect(w[0].n).toBe(1);

    await shift(c.id, 6); // 180 days
    await run();
    const counts = await raw.query(
      `select (select count(*) from rules where client_id=$1)::int rules,
              (select count(*) from ig_posts where client_id=$1)::int posts,
              (select count(*) from events where client_id=$1)::int events,
              (select count(*) from client_sessions where client_id=$1)::int sessions,
              (select count(*) from access_codes where client_id=$1)::int codes,
              (select status from clients where id=$1) status,
              (select count(*) from audit_log where client_id=$1)::int audit`,
      [c.id],
    );
    expect(counts.rows[0]).toMatchObject({ rules: 0, posts: 0, events: 0, sessions: 0, codes: 0, status: "archived" });
    expect(counts.rows[0].audit).toBeGreaterThan(0);
    expect((await login(c.codeHash)).ok).toBe(false);
    const { rows: k } = await raw.query("select status from clients where id=$1", [keep.id]);
    expect(k[0].status).toBe("active");
  });

  it("renewal before day 180 keeps everything", async () => {
    const c = await makeClient(admin.session);
    await save(c.id, { scope: "all", kw: ["سعر"] });
    await shift(c.id, 29 + 100);
    await run();
    await db.service("admin_subscription_renew", { p_session_hash: admin.session, p_client_id: c.id, p_note: "" });
    await run();
    const got = await db.asClient<{ can_edit: boolean; rules: unknown[] }>(c.id, "client_rules_get");
    expect(got).toMatchObject({ can_edit: true });
    expect(got.rules).toHaveLength(1);
  });
});
