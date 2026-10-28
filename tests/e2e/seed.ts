import { createHmac, randomBytes } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, E2E_PEPPER, E2E_SESSION_SECRET } from "../../playwright.config";

// Test fixtures written straight into the throwaway e2e database, using the
// same HMAC scheme as the server (so the app accepts these sessions).
const hx = (secret: string, msg: string) => "\\x" + createHmac("sha256", secret).update(msg).digest("hex");

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function seedAdmin(ctx: BrowserContext, baseURL: string) {
  const token = randomBytes(32).toString("base64url");
  await withDb(async (c) => {
    const { rows } = await c.query("insert into admins (setup_completed_at) values (now()) returning id");
    await c.query("insert into admin_sessions (admin_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')", [
      rows[0].id,
      hx(E2E_SESSION_SECRET, `admin-session:${token}`),
    ]);
  });
  await ctx.addCookies([{ name: "__Host-kts_a", value: token, url: baseURL.replace("http:", "https:"), httpOnly: true, secure: true, sameSite: "Strict" }]);
  return hx(E2E_SESSION_SECRET, `admin-session:${token}`);
}

export async function seedClient(adminSession: string, name: string) {
  const code = randomBytes(9).toString("base64url");
  const id = await withDb(async (c) => {
    const { rows } = await c.query("select public.admin_client_create($1, $2, app_private.today(), '', $3) as r", [
      adminSession,
      name,
      hx(E2E_PEPPER, code),
    ]);
    return rows[0].r.id as string;
  });
  return { id, code };
}

export async function seedClientSession(ctx: BrowserContext, baseURL: string, clientId: string, ua = "Chrome · Linux") {
  const token = randomBytes(32).toString("base64url");
  await withDb((c) =>
    c.query("insert into client_sessions (client_id, token_hash, ua_hint, expires_at) values ($1, $2, $3, now() + interval '30 days')", [
      clientId,
      hx(E2E_SESSION_SECRET, `session:${token}`),
      ua,
    ]),
  );
  await ctx.addCookies([{ name: "__Host-kts_s", value: token, url: baseURL.replace("http:", "https:"), httpOnly: true, secure: true, sameSite: "Lax" }]);
}
