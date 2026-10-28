import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hmac, isPlausibleAccessCode, normalizeAccessCode, randomToken, toByteaHex } from "@/lib/codes";
import { getDb } from "../db";
import { env } from "../env";
import { CLIENT_COOKIE, clientCookieOptions, clientIp, userAgentHint } from "../http";

export type LoginResult =
  | { ok: true }
  | { ok: false; failures: number; maxFailures: number; locked: boolean; retryAfterS: number };

type DbLogin =
  | { ok: true; client_id: string }
  | { ok: false; failures: number; max_failures: number; locked: boolean; retry_after_s: number };

export const hashAccessCode = async (code: string) => toByteaHex(await hmac(env().ACCESS_CODE_PEPPER, code));
export const hashSessionToken = async (token: string) => toByteaHex(await hmac(env().SESSION_SECRET, `session:${token}`));
export const hashIp = async (scope: "client" | "admin", ip: string) =>
  toByteaHex(await hmac(env().SESSION_SECRET, `ip:${scope}:${ip}`));

export async function loginWithCode(rawCode: string): Promise<LoginResult> {
  const code = normalizeAccessCode(rawCode);
  const db = await getDb();
  const token = randomToken();
  // Implausible input still goes through the same path (counts as a failure),
  // using a hash that cannot match anything.
  const codeHash = await hashAccessCode(isPlausibleAccessCode(code) ? code : `invalid:${randomToken(8)}`);
  const r = await db.service<DbLogin>("client_login", {
    p_ip_key: await hashIp("client", await clientIp()),
    p_code_hash: codeHash,
    p_session_hash: await hashSessionToken(token),
    p_ua: await userAgentHint(),
  });
  if (r.ok) {
    (await cookies()).set(CLIENT_COOKIE, token, clientCookieOptions);
    return { ok: true };
  }
  return { ok: false, failures: r.failures, maxFailures: r.max_failures, locked: r.locked, retryAfterS: r.retry_after_s };
}

export type ClientSession = { clientId: string; account: "active" | "disabled" };

/** The current client session, validated against the database once per request. */
export const getClientSession = cache(async (): Promise<ClientSession | null> => {
  const token = (await cookies()).get(CLIENT_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = await getDb();
  const r = await db.service<{ client_id: string; account: "active" | "disabled" } | null>("client_session_resolve", {
    p_session_hash: await hashSessionToken(token),
  });
  return r ? { clientId: r.client_id, account: r.account } : null;
});

/** For client pages: active session or redirect. */
export async function requireClient(): Promise<string> {
  const s = await getClientSession();
  if (!s) redirect("/session-expired");
  if (s.account !== "active") redirect("/account-disabled");
  return s.clientId;
}

export async function logoutClient(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CLIENT_COOKIE)?.value;
  if (token && token.length <= 100) {
    const db = await getDb();
    await db.service("client_logout", { p_session_hash: await hashSessionToken(token) });
  }
  jar.set(CLIENT_COOKIE, "", { ...clientCookieOptions, maxAge: 0 });
}
