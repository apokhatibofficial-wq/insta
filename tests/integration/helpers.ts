import pg from "pg";
import { createPgDb } from "@/server/db/pg";
import { hmac, randomToken, toByteaHex } from "@/lib/codes";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/khatib_test";

export const db = createPgDb(TEST_DATABASE_URL);

/** Superuser connection for test setup/inspection only. */
export const raw = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });

export const h = async (s: string) => toByteaHex(await hmac("test-secret-test-secret-test-secret", s));
export const rnd = () => randomToken(12);

/** An admin with a completed setup and a live session. Returns its session hash. */
export async function makeAdmin(): Promise<{ adminId: string; session: string }> {
  const { rows } = await raw.query(
    "insert into admins (setup_completed_at) values (now()) returning id",
  );
  const adminId = rows[0].id as string;
  const session = await h(`admin-session:${rnd()}`);
  await raw.query(
    "insert into admin_sessions (admin_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')",
    [adminId, session],
  );
  return { adminId, session };
}

export async function stepup(session: string) {
  await raw.query("update admin_sessions set stepup_at = now() where token_hash = $1", [session]);
}

/** Creates a client through the real admin function. Returns ids and the plain code. */
export async function makeClient(session: string, name = "عميل اختبار", startsOn?: string) {
  const code = rnd();
  const c = await db.service<{ id: string; public_id: string; ends_on: string }>("admin_client_create", {
    p_session_hash: session,
    p_name: name,
    p_starts_on: startsOn ?? (await today()),
    p_note: "",
    p_code_hash: await h(`code:${code}`),
  });
  return { ...c, code, codeHash: await h(`code:${code}`) };
}

export async function today(): Promise<string> {
  const { rows } = await raw.query("select to_char(app_private.today(), 'YYYY-MM-DD') as d");
  return rows[0].d;
}

export async function login(codeHash: string, ip = rnd()) {
  const sessionHash = await h(`session:${rnd()}`);
  const r = await db.service<{ ok: boolean; client_id?: string; failures?: number; locked?: boolean; retry_after_s?: number }>(
    "client_login",
    { p_ip_key: await h(`ip:${ip}`), p_code_hash: codeHash, p_session_hash: sessionHash, p_ua: "test" },
  );
  return { ...r, sessionHash };
}
