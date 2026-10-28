import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, makeAdmin, makeClient, raw } from "./helpers";

// Tenant isolation at the database level: runs queries exactly as PostgREST
// would for a client JWT (role authenticated + request.jwt.claims).
async function as<T = Record<string, unknown>>(
  role: "anon" | "authenticated",
  clientId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const c = await raw.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    const claims = clientId ? { role, client_id: clientId } : { role };
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows as T[];
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

let A: Awaited<ReturnType<typeof makeClient>>;
let B: Awaited<ReturnType<typeof makeClient>>;
let postB: string;

beforeAll(async () => {
  const { session } = await makeAdmin();
  A = await makeClient(session, "العميل أ");
  B = await makeClient(session, "العميل ب");
  // Tenant data for B in every tenant table.
  const p = await raw.query(
    "insert into ig_posts (client_id, ig_media_id, caption) values ($1, 'm-b-1', 'b') returning id",
    [B.id],
  );
  postB = p.rows[0].id;
  const r = await raw.query("insert into rules (client_id, scope, dm_text) values ($1, 'posts', 'hi') returning id", [B.id]);
  await raw.query("insert into rule_posts (rule_id, post_id, client_id) values ($1, $2, $3)", [r.rows[0].id, postB, B.id]);
  await raw.query("insert into rule_keywords (rule_id, client_id, keyword, keyword_norm) values ($1, $2, 'سعر', 'سعر')", [
    r.rows[0].id,
    B.id,
  ]);
  await raw.query("insert into events (client_id, kind, summary) values ($1, 'test', 'b event')", [B.id]);
  await raw.query("update ig_connections set token_ciphertext = '\\x01', username = 'b_user' where client_id = $1", [B.id]);
});

afterAll(async () => {
  await db.end();
  await raw.end();
});

const tenantTables = ["clients", "subscriptions", "bot_settings", "ig_posts", "rules", "rule_posts", "rule_keywords", "events"];

describe("RLS: client A cannot see client B", () => {
  it.each(tenantTables)("%s: only own rows are visible", async (t) => {
    const idCol = t === "clients" ? "id" : "client_id";
    const rows = await as<{ cid: string }>("authenticated", A.id, `select ${idCol} as cid from public.${t}`);
    expect(rows.every((r) => r.cid === A.id)).toBe(true);
    if (["clients", "subscriptions", "bot_settings"].includes(t)) expect(rows.length).toBeGreaterThan(0);
    const forged = await as("authenticated", A.id, `select 1 from public.${t} where ${idCol} = $1`, [B.id]);
    expect(forged).toHaveLength(0);
  });

  it("ig_connections: own status visible, token columns never", async () => {
    const own = await as("authenticated", A.id, "select client_id, username, status from public.ig_connections");
    expect(own).toHaveLength(1);
    await expect(as("authenticated", A.id, "select token_ciphertext from public.ig_connections")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("subscriptions: the admin's payment note is hidden from clients", async () => {
    await expect(as("authenticated", A.id, "select note from public.subscriptions")).rejects.toThrow(/permission denied/);
  });

  it("client_me() returns only the caller's own tenant", async () => {
    const me = await db.asClient<{ id: string; name: string }>(A.id, "client_me");
    expect(me.id).toBe(A.id);
    expect(me.name).toBe("العميل أ");
  });

  it("a JWT without client_id sees nothing", async () => {
    for (const t of tenantTables) {
      expect(await as("authenticated", null, `select 1 from public.${t}`)).toHaveLength(0);
    }
  });
});

describe("RLS: client writes", () => {
  it("cannot change subscriptions, clients, codes, IG link or the audit log", async () => {
    const attempts = [
      ["update public.subscriptions set ends_on = ends_on + 365, starts_on = starts_on + 365"],
      ["insert into public.subscriptions (client_id, starts_on, ends_on) values ($1, current_date, current_date + 29)", [A.id]],
      ["update public.clients set status = 'active'"],
      ["update public.access_codes set status = 'active'"],
      ["select * from public.access_codes"],
      ["update public.ig_connections set status = 'ok'"],
      ["insert into public.audit_log (actor_type, action) values ('client', 'account.created')"],
      ["select * from public.audit_log"],
      ["select * from public.client_sessions"],
      ["select * from public.admin_sessions"],
      ["update public.bot_settings set admin_allowed = true"],
    ] as const;
    for (const [sql, params] of attempts) {
      await expect(as("authenticated", A.id, sql, params ? [...params] : [])).rejects.toThrow(/permission denied/);
    }
  });

  it("can switch its own bot on/off, but never another tenant's", async () => {
    const own = await as("authenticated", A.id, "update public.bot_settings set client_enabled = false returning client_id");
    expect(own).toEqual([{ client_id: A.id }]);
    const other = await as("authenticated", A.id, "update public.bot_settings set client_enabled = false where client_id = $1 returning 1", [B.id]);
    expect(other).toHaveLength(0);
    const { rows } = await raw.query("select client_enabled from bot_settings where client_id = $1", [B.id]);
    expect(rows[0].client_enabled).toBe(true);
  });

  it("cannot create rules for, or attach rules to, another tenant", async () => {
    await expect(
      as("authenticated", A.id, "insert into public.rules (client_id, dm_text) values ($1, 'x')", [B.id]),
    ).rejects.toThrow(/row-level security/);
    const r = await as<{ id: string }>("authenticated", A.id, "insert into public.rules (client_id, dm_text) values ($1, 'x') returning id", [A.id]);
    // Own rule + B's post: the composite FK refuses a cross-tenant link.
    await expect(
      as("authenticated", A.id, "insert into public.rule_posts (rule_id, post_id, client_id) values ($1, $2, $3)", [
        r[0]!.id,
        postB,
        A.id,
      ]),
    ).rejects.toThrow();
  });

  it("cannot delete another tenant's rules", async () => {
    const del = await as("authenticated", A.id, "delete from public.rules where client_id = $1 returning 1", [B.id]);
    expect(del).toHaveLength(0);
  });
});

describe("Function privileges", () => {
  it("authenticated cannot call server/admin functions", async () => {
    for (const fn of ["client_login(null, null, null)", "admin_clients_list(null)", "can_automate(null)", "admin_setup_state()"]) {
      await expect(as("authenticated", A.id, `select public.${fn}`)).rejects.toThrow(/permission denied/);
    }
  });

  it("anon has no access to anything", async () => {
    await expect(as("anon", null, "select * from public.clients")).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, "select public.client_me()")).rejects.toThrow(/permission denied/);
    const { rows } = await raw.query(
      "select count(*)::int as n from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'",
    );
    expect(rows[0].n).toBe(0);
  });

  it("every public table has RLS enabled", async () => {
    const { rows } = await raw.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(rows).toEqual([]);
  });
});
