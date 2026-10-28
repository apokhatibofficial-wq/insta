import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, h, login, makeAdmin, makeClient, raw, rnd, stepup } from "./helpers";

let admin: Awaited<ReturnType<typeof makeAdmin>>;
beforeAll(async () => {
  admin = await makeAdmin();
});
afterAll(async () => {
  await db.end();
  await raw.end();
});

const resolve = (sessionHash: string) =>
  db.service<{ client_id: string; account: string } | null>("client_session_resolve", { p_session_hash: sessionHash });

describe("client code login", () => {
  it("valid code → session; wrong code → generic failure", async () => {
    const c = await makeClient(admin.session);
    const ok = await login(c.codeHash);
    expect(ok.ok).toBe(true);
    expect(ok.client_id).toBe(c.id);
    expect((await resolve(ok.sessionHash))?.client_id).toBe(c.id);

    const bad = await login(await h("code:wrong"));
    expect(bad).toMatchObject({ ok: false, failures: 1, locked: false });
    expect(bad).not.toHaveProperty("client_id");
  });

  it("locks an IP after 5 failures for 15 minutes — even for a correct code", async () => {
    const c = await makeClient(admin.session);
    const ip = rnd();
    for (let i = 1; i <= 4; i++) {
      expect(await login(await h(`code:wrong${i}`), ip)).toMatchObject({ ok: false, failures: i, locked: false });
    }
    const fifth = await login(await h("code:wrong5"), ip);
    expect(fifth).toMatchObject({ ok: false, failures: 5, locked: true });
    expect(fifth.retry_after_s).toBeGreaterThan(14 * 60);
    expect(await login(c.codeHash, ip)).toMatchObject({ ok: false, locked: true });
    // Another IP is unaffected.
    expect((await login(c.codeHash)).ok).toBe(true);
    // The lockout is audited (without any code or hash).
    const { rows } = await raw.query("select details from audit_log where action = 'security.client_login_locked' order by id desc limit 1");
    expect(JSON.stringify(rows[0].details)).not.toMatch(/\\x|code/);
  });

  it("lock expires after its window", async () => {
    const ip = rnd();
    for (let i = 0; i < 5; i++) await login(await h(`code:w${i}`), ip);
    await raw.query("update login_attempts set locked_until = now() - interval '1 second' where key = $1", [await h(`ip:${ip}`)]);
    const c = await makeClient(admin.session);
    expect((await login(c.codeHash, ip)).ok).toBe(true);
  });

  it("revoked code ⇒ login fails and existing sessions die", async () => {
    const c = await makeClient(admin.session);
    const s = await login(c.codeHash);
    await stepup(admin.session);
    await db.service("admin_code_revoke", { p_session_hash: admin.session, p_client_id: c.id });
    expect(await resolve(s.sessionHash)).toBeNull();
    expect((await login(c.codeHash)).ok).toBe(false);
  });

  it("regenerated code ⇒ old code fails, new works, old sessions die", async () => {
    const c = await makeClient(admin.session);
    const s = await login(c.codeHash);
    const newHash = await h(`code:${rnd()}`);
    await stepup(admin.session);
    await db.service("admin_code_regenerate", { p_session_hash: admin.session, p_client_id: c.id, p_code_hash: newHash });
    expect(await resolve(s.sessionHash)).toBeNull();
    expect((await login(c.codeHash)).ok).toBe(false);
    expect((await login(newHash)).ok).toBe(true);
  });

  it("disabled account ⇒ sessions die and login fails (generic error)", async () => {
    const c = await makeClient(admin.session);
    const s = await login(c.codeHash);
    await db.service("admin_account_set_active", { p_session_hash: admin.session, p_client_id: c.id, p_active: false });
    expect(await resolve(s.sessionHash)).toBeNull();
    const r = await login(c.codeHash);
    expect(r.ok).toBe(false);
    await db.service("admin_account_set_active", { p_session_hash: admin.session, p_client_id: c.id, p_active: true });
    expect((await login(c.codeHash)).ok).toBe(true);
  });

  it("admin 'end all sessions' and client logout revoke sessions", async () => {
    const c = await makeClient(admin.session);
    const s1 = await login(c.codeHash);
    const s2 = await login(c.codeHash);
    const r = await db.service<{ ended: number }>("admin_sessions_end", { p_session_hash: admin.session, p_client_id: c.id });
    expect(r.ended).toBe(2);
    expect(await resolve(s1.sessionHash)).toBeNull();
    expect(await resolve(s2.sessionHash)).toBeNull();
    const s3 = await login(c.codeHash);
    await db.service("client_logout", { p_session_hash: s3.sessionHash });
    expect(await resolve(s3.sessionHash)).toBeNull();
  });

  it("session expiry slides on use and expired sessions are rejected", async () => {
    const c = await makeClient(admin.session);
    const s = await login(c.codeHash);
    await raw.query(
      "update client_sessions set last_seen_at = now() - interval '1 day', expires_at = now() + interval '1 day' where token_hash = $1",
      [s.sessionHash],
    );
    await resolve(s.sessionHash);
    const { rows } = await raw.query("select expires_at > now() + interval '29 days' as slid from client_sessions where token_hash = $1", [
      s.sessionHash,
    ]);
    expect(rows[0].slid).toBe(true);
    await raw.query("update client_sessions set expires_at = now() - interval '1 second' where token_hash = $1", [s.sessionHash]);
    expect(await resolve(s.sessionHash)).toBeNull();
  });

  it("an expired subscription still allows login (client sees the expired page)", async () => {
    const c = await makeClient(admin.session);
    await raw.query("update subscriptions set starts_on = starts_on - 60, ends_on = ends_on - 60 where client_id = $1", [c.id]);
    expect((await login(c.codeHash)).ok).toBe(true);
  });
});

describe("admin session checks inside every admin function", () => {
  const calls = (s: string, id: string) => [
    ["admin_clients_list", { p_session_hash: s }],
    ["admin_client_detail", { p_session_hash: s, p_client_id: id }],
    ["admin_subscription_renew", { p_session_hash: s, p_client_id: id, p_note: "" }],
    ["admin_subscription_set_paused", { p_session_hash: s, p_client_id: id, p_paused: true }],
    ["admin_subscription_end", { p_session_hash: s, p_client_id: id }],
    ["admin_code_regenerate", { p_session_hash: s, p_client_id: id, p_code_hash: "\\x00" }],
    ["admin_code_revoke", { p_session_hash: s, p_client_id: id }],
    ["admin_sessions_end", { p_session_hash: s, p_client_id: id }],
    ["admin_account_set_active", { p_session_hash: s, p_client_id: id, p_active: false }],
    ["admin_bot_set_allowed", { p_session_hash: s, p_client_id: id, p_allowed: false }],
    ["admin_client_create", { p_session_hash: s, p_name: "x y", p_starts_on: "2026-01-01", p_note: "", p_code_hash: "\\x00" }],
  ] as const;

  it("rejects a missing, unknown, expired or revoked admin session", async () => {
    const c = await makeClient(admin.session);
    const expired = await makeAdmin();
    await raw.query("update admin_sessions set expires_at = now() - interval '1 second' where token_hash = $1", [expired.session]);
    const revoked = await makeAdmin();
    await db.service("admin_logout", { p_session_hash: revoked.session });
    // A client's session hash must never work as an admin session.
    const clientSession = (await login(c.codeHash)).sessionHash;
    for (const s of [await h("nope"), expired.session, revoked.session, clientSession]) {
      for (const [fn, args] of calls(s, c.id)) {
        await expect(db.service(fn, args), fn).rejects.toThrow("admin_auth_required");
      }
    }
  });

  it("an admin whose setup is not complete cannot act", async () => {
    const { rows } = await raw.query("insert into admins default values returning id");
    const s = await h(rnd());
    await raw.query("insert into admin_sessions (admin_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')", [
      rows[0].id,
      s,
    ]);
    await expect(db.service("admin_clients_list", { p_session_hash: s })).rejects.toThrow("admin_auth_required");
  });

  it("destructive actions require a fresh step-up, consumed per action", async () => {
    const c = await makeClient(admin.session);
    const args = { p_session_hash: admin.session, p_client_id: c.id };
    await expect(db.service("admin_subscription_end", args)).rejects.toThrow("stepup_required");
    await expect(db.service("admin_code_revoke", args)).rejects.toThrow("stepup_required");
    await expect(db.service("admin_code_regenerate", { ...args, p_code_hash: await h(rnd()) })).rejects.toThrow("stepup_required");

    // Stale step-up (older than 3 minutes) is refused.
    await raw.query("update admin_sessions set stepup_at = now() - interval '4 minutes' where token_hash = $1", [admin.session]);
    await expect(db.service("admin_code_revoke", args)).rejects.toThrow("stepup_required");

    await stepup(admin.session);
    await db.service("admin_code_revoke", args);
    // Consumed: the next destructive action needs a new step-up.
    await expect(db.service("admin_subscription_end", args)).rejects.toThrow("stepup_required");
    // Nothing changed for the refused action.
    const st = await db.service<{ state: string }>("admin_client_detail", args);
    expect((st as unknown as { subscription: { state: string } }).subscription.state).toBe("active");
  });
});

describe("admin setup & WebAuthn challenges", () => {
  it("challenges are single-use, purpose-bound and expire", async () => {
    const id = await db.service<string>("webauthn_challenge_create", { p_purpose: "login", p_challenge: "abc", p_admin_id: null });
    expect(await db.service("webauthn_challenge_consume", { p_id: id, p_purpose: "stepup" })).toBeNull();
    expect(await db.service("webauthn_challenge_consume", { p_id: id, p_purpose: "login" })).toMatchObject({ challenge: "abc" });
    expect(await db.service("webauthn_challenge_consume", { p_id: id, p_purpose: "login" })).toBeNull();
    const old = await db.service<string>("webauthn_challenge_create", { p_purpose: "login", p_challenge: "x", p_admin_id: null });
    await raw.query("update webauthn_challenges set expires_at = now() - interval '1 second' where id = $1", [old]);
    expect(await db.service("webauthn_challenge_consume", { p_id: old, p_purpose: "login" })).toBeNull();
  });

  it("recovery codes are single-use and rate limited", async () => {
    const a = await makeAdmin();
    const code = await h(`recovery:${rnd()}`);
    await raw.query("insert into admin_recovery_codes (admin_id, code_hash) values ($1, $2)", [a.adminId, code]);
    const ip = await h(rnd());
    const first = await db.service<{ ok: boolean }>("admin_login_with_recovery", { p_ip_key: ip, p_code_hash: code, p_session_hash: await h(rnd()) });
    expect(first.ok).toBe(true);
    const again = await db.service<{ ok: boolean }>("admin_login_with_recovery", { p_ip_key: ip, p_code_hash: code, p_session_hash: await h(rnd()) });
    expect(again.ok).toBe(false);
    const { rows } = await raw.query("select via_recovery from admin_sessions where admin_id = $1 order by created_at desc limit 1", [a.adminId]);
    expect(rows[0].via_recovery).toBe(true);
    for (let i = 0; i < 4; i++) {
      await db.service("admin_login_with_recovery", { p_ip_key: ip, p_code_hash: await h(rnd()), p_session_hash: await h(rnd()) });
    }
    const locked = await db.service<{ ok: boolean; locked: boolean }>("admin_login_check", { p_ip_key: ip });
    expect(locked).toMatchObject({ ok: false, locked: true });
    const { rows: audit } = await raw.query("select count(*)::int n from audit_log where action = 'security.admin_login_failed'");
    expect(audit[0].n).toBeGreaterThanOrEqual(5);
  });
});

describe("audit log is append-only", () => {
  it("UPDATE / DELETE / TRUNCATE are refused, even for the service role and the owner", async () => {
    const c = await makeClient(admin.session);
    const { rows } = await raw.query("select id from audit_log where client_id = $1 limit 1", [c.id]);
    const id = rows[0].id;
    await expect(raw.query("update audit_log set action = 'account.enabled' where id = $1", [id])).rejects.toThrow(/append-only/);
    await expect(raw.query("delete from audit_log where id = $1", [id])).rejects.toThrow(/append-only/);
    await expect(raw.query("truncate audit_log")).rejects.toThrow(/append-only/);
    const sr = await raw.connect();
    try {
      await sr.query("begin; set local role service_role");
      await expect(sr.query("delete from audit_log where id = $1", [id])).rejects.toThrow(/permission denied|append-only/);
    } finally {
      await sr.query("rollback");
      sr.release();
    }
  });

  it("never stores codes or hashes", async () => {
    const { rows } = await raw.query("select details::text as d from audit_log");
    for (const r of rows) expect(r.d).not.toMatch(/\\\\x[0-9a-f]{16}/);
  });
});
