import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { db, login, makeAdmin, makeClient, raw, stepup, today } from "./helpers";

type Sub = { state: string; starts_on?: string; ends_on?: string; days_left?: number; total_days?: number };

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let T: string;
beforeAll(async () => {
  admin = await makeAdmin();
  T = await today();
});
afterAll(async () => {
  await db.end();
  await raw.end();
});

const detail = (id: string) =>
  db.service<{ subscription: Sub; bot_state: string; log: { action: string; details: Record<string, unknown> }[] }>(
    "admin_client_detail",
    { p_session_hash: admin.session, p_client_id: id },
  );
const renew = (id: string, note = "") =>
  db.service<Sub>("admin_subscription_renew", { p_session_hash: admin.session, p_client_id: id, p_note: note });
const canAutomate = (id: string) => db.service<boolean>("can_automate", { p_client_id: id });
const igOk = (id: string) => raw.query("update ig_connections set status = 'ok' where client_id = $1", [id]);

describe("30-day subscriptions (Asia/Damascus)", () => {
  it("a new client gets 30 inclusive days from the start date", async () => {
    const c = await makeClient(admin.session);
    expect(c.ends_on).toBe(addDays(T, 29));
    const s = (await detail(c.id)).subscription;
    expect(s).toMatchObject({ state: "active", starts_on: T, ends_on: addDays(T, 29), days_left: 30, total_days: 30 });
  });

  it("start date must be today or up to 30 days back", async () => {
    for (const d of [addDays(T, 1), addDays(T, -31)]) {
      await expect(makeClient(admin.session, "عميل", d)).rejects.toThrow("invalid_input");
    }
    const c = await makeClient(admin.session, "عميل", addDays(T, -10));
    expect((await detail(c.id)).subscription.days_left).toBe(20);
  });

  it("renewal while active starts the day after the current end — no lost days", async () => {
    const c = await makeClient(admin.session);
    const s = await renew(c.id, "دُفع نقدًا");
    expect(s).toMatchObject({ state: "active", ends_on: addDays(T, 59), days_left: 60 });
    const s2 = await renew(c.id);
    expect(s2.ends_on).toBe(addDays(T, 89));
    const log = (await detail(c.id)).log;
    expect(log[1]).toMatchObject({ action: "subscription.renewed", details: { note: "دُفع نقدًا", starts_on: addDays(T, 30) } });
  });

  it("renewal after expiry starts today", async () => {
    const c = await makeClient(admin.session);
    await raw.query("update subscriptions set starts_on = starts_on - 45, ends_on = ends_on - 45 where client_id = $1", [c.id]);
    expect((await detail(c.id)).subscription.state).toBe("expired");
    const s = await renew(c.id);
    expect(s).toMatchObject({ state: "active", starts_on: T, ends_on: addDays(T, 29) });
  });

  it("the last day (ends_on) is still active; the day after is expired", async () => {
    const c = await makeClient(admin.session);
    await raw.query("update subscriptions set starts_on = starts_on - 29, ends_on = ends_on - 29 where client_id = $1", [c.id]);
    expect((await detail(c.id)).subscription).toMatchObject({ state: "active", ends_on: T, days_left: 1 });
    await raw.query("update subscriptions set starts_on = starts_on - 1, ends_on = ends_on - 1 where client_id = $1", [c.id]);
    expect((await detail(c.id)).subscription.state).toBe("expired");
  });

  it("pause / resume keep the dates; pausing stops automation", async () => {
    const c = await makeClient(admin.session);
    await igOk(c.id);
    expect(await canAutomate(c.id)).toBe(true);
    const p = await db.service<Sub>("admin_subscription_set_paused", { p_session_hash: admin.session, p_client_id: c.id, p_paused: true });
    expect(p).toMatchObject({ state: "paused", ends_on: addDays(T, 29) });
    expect(await canAutomate(c.id)).toBe(false);
    expect((await detail(c.id)).bot_state).toBe("sub_paused");
    await db.service("admin_subscription_set_paused", { p_session_hash: admin.session, p_client_id: c.id, p_paused: false });
    expect(await canAutomate(c.id)).toBe(true);
  });

  it("ending now (with step-up) stops automation today and keeps the data", async () => {
    const c = await makeClient(admin.session);
    await igOk(c.id);
    await stepup(admin.session);
    const s = await db.service<Sub>("admin_subscription_end", { p_session_hash: admin.session, p_client_id: c.id });
    expect(s.state).toBe("expired");
    expect(await canAutomate(c.id)).toBe(false);
    const { rows } = await raw.query("select count(*)::int n from clients where id = $1", [c.id]);
    expect(rows[0].n).toBe(1);
    // A renewal afterwards starts today.
    expect((await renew(c.id)).starts_on).toBe(T);
  });
});

describe("can_automate() — every check must pass", () => {
  it("expired / paused / disabled / admin-blocked / IG broken / client off ⇒ no automation", async () => {
    const c = await makeClient(admin.session);
    expect(await canAutomate(c.id)).toBe(false); // IG not connected yet
    await igOk(c.id);
    expect(await canAutomate(c.id)).toBe(true);

    await db.service("admin_bot_set_allowed", { p_session_hash: admin.session, p_client_id: c.id, p_allowed: false });
    expect(await canAutomate(c.id)).toBe(false);
    await db.service("admin_bot_set_allowed", { p_session_hash: admin.session, p_client_id: c.id, p_allowed: true });

    await raw.query("update bot_settings set client_enabled = false where client_id = $1", [c.id]);
    expect(await canAutomate(c.id)).toBe(false);
    await raw.query("update bot_settings set client_enabled = true where client_id = $1", [c.id]);

    await raw.query("update ig_connections set status = 'needs_reconnect' where client_id = $1", [c.id]);
    expect(await canAutomate(c.id)).toBe(false);
    await igOk(c.id);

    await db.service("admin_account_set_active", { p_session_hash: admin.session, p_client_id: c.id, p_active: false });
    expect(await canAutomate(c.id)).toBe(false);
    await db.service("admin_account_set_active", { p_session_hash: admin.session, p_client_id: c.id, p_active: true });

    await raw.query("update subscriptions set starts_on = starts_on - 31, ends_on = ends_on - 31 where client_id = $1", [c.id]);
    expect(await canAutomate(c.id)).toBe(false);
    expect(await canAutomate("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("a client session cannot extend its own subscription", async () => {
    const c = await makeClient(admin.session);
    const s = await login(c.codeHash);
    expect(s.ok).toBe(true);
    await expect(db.asClient(c.id, "admin_subscription_renew", { p_session_hash: s.sessionHash, p_client_id: c.id, p_note: "" })).rejects.toThrow();
    expect((await detail(c.id)).subscription.ends_on).toBe(addDays(T, 29));
  });
});
