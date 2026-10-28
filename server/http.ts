import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

export const CLIENT_COOKIE = "__Host-kts_s";
export const ADMIN_COOKIE = "__Host-kts_a";

export const clientCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  // The server enforces the 30-day sliding expiry; the cookie just carries the token.
  maxAge: 60 * 60 * 24 * 400,
};

export const adminCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
};

/**
 * Client IP for rate limiting. Only Cloudflare's header is trusted: Cloudflare
 * sets it on every request and clients cannot override it. Anything else
 * (local dev) shares one bucket.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip")?.trim() || "local";
}

export async function userAgentHint(): Promise<string> {
  const ua = (await headers()).get("user-agent") ?? "";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ").slice(0, 120);
}

/**
 * CSRF defence for every mutating server action, on top of SameSite cookies
 * and Next's own Server Action origin check: the Origin header must be ours.
 */
export async function assertSameOrigin(): Promise<void> {
  const origin = (await headers()).get("origin");
  if (!origin || origin !== env().WEBAUTHN_ORIGIN) {
    throw new Error("forbidden_origin");
  }
}
