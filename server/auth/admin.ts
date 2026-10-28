import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCode,
  hmac,
  normalizeRecoveryCode,
  randomToken,
  timingSafeEqualStr,
  toByteaHex,
} from "@/lib/codes";
import { getDb, DbError } from "../db";
import { env } from "../env";
import { ADMIN_COOKIE, adminCookieOptions, clientIp } from "../http";
import { hashIp } from "./client";

const RP_NAME = "KHATIB Admin";

const hashAdminSession = async (token: string) => toByteaHex(await hmac(env().SESSION_SECRET, `admin-session:${token}`));
const hashRecoveryCode = async (code: string) => toByteaHex(await hmac(env().ACCESS_CODE_PEPPER, `recovery:${code}`));

function rp() {
  const e = env();
  return { rpID: e.WEBAUTHN_RP_ID, origin: e.WEBAUTHN_ORIGIN };
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToBytea = (b: Uint8Array) => toByteaHex(b);

async function setAdminCookie(token: string) {
  (await cookies()).set(ADMIN_COOKIE, token, adminCookieOptions);
}

export type Challenge<T> = { challengeId: string; options: T };

async function storeChallenge(purpose: "setup" | "register" | "login" | "stepup", challenge: string, adminId?: string) {
  const db = await getDb();
  return db.service<string>("webauthn_challenge_create", {
    p_purpose: purpose,
    p_challenge: challenge,
    p_admin_id: adminId ?? null,
  });
}

async function consumeChallenge(purpose: "setup" | "register" | "login" | "stepup", id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  return db.service<{ challenge: string; admin_id: string | null } | null>("webauthn_challenge_consume", {
    p_id: id,
    p_purpose: purpose,
  });
}

// ---------------------------------------------------------------------------
// First-run setup (guarded by ADMIN_SETUP_TOKEN; closed once complete)
// ---------------------------------------------------------------------------
export type SetupState = { admin_exists: boolean; setup_complete: boolean; passkeys: number };

export async function getSetupState(): Promise<SetupState> {
  const db = await getDb();
  return db.service<SetupState>("admin_setup_state");
}

export function checkSetupToken(token: string): boolean {
  const expected = env().ADMIN_SETUP_TOKEN;
  return !!expected && timingSafeEqualStr(token, expected);
}

async function requireOpenSetup(token: string): Promise<string> {
  if (!checkSetupToken(token)) throw new DbError("admin_auth_required");
  const db = await getDb();
  return db.service<string>("admin_setup_ensure_admin");
}

async function passkeyRegistrationOptions(adminId: string, existing: string[]) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp().rpID,
    userName: "admin",
    userDisplayName: "المدير",
    userID: new TextEncoder().encode(adminId),
    attestationType: "none",
    excludeCredentials: existing.map((id) => ({ id })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
}

export async function setupRegistrationOptions(token: string): Promise<Challenge<PublicKeyCredentialCreationOptionsJSON>> {
  const adminId = await requireOpenSetup(token);
  const options = await passkeyRegistrationOptions(adminId, []);
  return { challengeId: await storeChallenge("setup", options.challenge, adminId), options };
}

async function verifyRegistration(purpose: "setup" | "register", challengeId: string, response: RegistrationResponseJSON) {
  const ch = await consumeChallenge(purpose, challengeId);
  if (!ch?.admin_id) return null;
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: rp().origin,
    expectedRPID: rp().rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!v?.verified) return null;
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
  return {
    adminId: ch.admin_id,
    args: {
      p_credential_id: credential.id,
      p_public_key: bytesToBytea(credential.publicKey),
      p_counter: credential.counter,
      p_transports: credential.transports ?? [],
      p_device_type: credentialDeviceType,
      p_backed_up: credentialBackedUp,
    },
  };
}

export async function setupVerifyRegistration(
  token: string,
  challengeId: string,
  response: RegistrationResponseJSON,
): Promise<{ ok: true; passkeys: number } | { ok: false }> {
  await requireOpenSetup(token);
  const r = await verifyRegistration("setup", challengeId, response);
  if (!r) return { ok: false };
  const db = await getDb();
  const out = await db.service<{ passkeys: number }>("admin_setup_add_passkey", { p_admin_id: r.adminId, ...r.args });
  return { ok: true, passkeys: out.passkeys };
}

/** Finishes setup: stores 10 hashed recovery codes, opens a session, returns the codes once. */
export async function setupComplete(token: string): Promise<string[]> {
  const adminId = await requireOpenSetup(token);
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const sessionToken = randomToken();
  const db = await getDb();
  await db.service("admin_setup_complete", {
    p_admin_id: adminId,
    p_recovery_hashes: await Promise.all(codes.map(hashRecoveryCode)),
    p_session_hash: await hashAdminSession(sessionToken),
  });
  await setAdminCookie(sessionToken);
  return codes;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export type RateLimited = { ok: false; locked: boolean; retryAfterS: number };
type DbRate = { ok: boolean; locked?: boolean; retry_after_s?: number };
const rateOut = (r: DbRate): RateLimited => ({ ok: false, locked: !!r.locked, retryAfterS: r.retry_after_s ?? 0 });

export async function loginOptions(): Promise<Challenge<PublicKeyCredentialRequestOptionsJSON>> {
  // Discoverable credentials: no allowCredentials list, so nothing leaks about which keys exist.
  const options = await generateAuthenticationOptions({ rpID: rp().rpID, userVerification: "required" });
  return { challengeId: await storeChallenge("login", options.challenge), options };
}

type Passkey = { admin_id: string; public_key: string; counter: number; transports: string[] };

async function verifyAssertion(
  purpose: "login" | "stepup",
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<{ adminId: string; challengeAdminId: string | null; credentialId: string; newCounter: number } | null> {
  const ch = await consumeChallenge(purpose, challengeId);
  if (!ch) return null;
  if (typeof response?.id !== "string" || response.id.length > 1024) return null;
  const db = await getDb();
  const pk = await db.service<Passkey | null>("admin_passkey_lookup", { p_credential_id: response.id });
  if (!pk) return null;
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge: ch.challenge,
    expectedOrigin: rp().origin,
    expectedRPID: rp().rpID,
    requireUserVerification: true,
    credential: {
      id: response.id,
      publicKey: b64ToBytes(pk.public_key),
      counter: Number(pk.counter),
      transports: pk.transports as AuthenticatorTransport[],
    },
  }).catch(() => null);
  if (!v?.verified) return null;
  return {
    adminId: pk.admin_id,
    challengeAdminId: ch.admin_id,
    credentialId: response.id,
    newCounter: v.authenticationInfo.newCounter,
  };
}

export async function loginWithPasskey(
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<{ ok: true } | RateLimited> {
  const db = await getDb();
  const ipKey = await hashIp("admin", await clientIp());
  const gate = await db.service<DbRate>("admin_login_check", { p_ip_key: ipKey });
  if (!gate.ok) return rateOut(gate);

  const v = await verifyAssertion("login", challengeId, response);
  if (!v) return rateOut(await db.service<DbRate>("admin_login_failed", { p_ip_key: ipKey, p_method: "passkey" }));

  const token = randomToken();
  await db.service("admin_login_with_passkey", {
    p_ip_key: ipKey,
    p_credential_id: v.credentialId,
    p_new_counter: v.newCounter,
    p_session_hash: await hashAdminSession(token),
  });
  await setAdminCookie(token);
  return { ok: true };
}

export async function loginWithRecoveryCode(raw: string): Promise<{ ok: true } | RateLimited> {
  const code = normalizeRecoveryCode(raw);
  const db = await getDb();
  const token = randomToken();
  const r = await db.service<DbRate>("admin_login_with_recovery", {
    p_ip_key: await hashIp("admin", await clientIp()),
    p_code_hash: await hashRecoveryCode(code.length === 12 ? code : `invalid:${randomToken(8)}`),
    p_session_hash: await hashAdminSession(token),
  });
  if (!r.ok) return rateOut(r);
  await setAdminCookie(token);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
export type AdminSession = {
  token: string;
  sessionHash: string;
  adminId: string;
  displayName: string;
  viaRecovery: boolean;
  passkeyIds: string[];
  recoveryCodesLeft: number;
};

export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const sessionHash = await hashAdminSession(token);
  const db = await getDb();
  const r = await db.service<{
    admin_id: string;
    display_name: string;
    via_recovery: boolean;
    passkey_ids: string[];
    recovery_codes_left: number;
  } | null>("admin_session_resolve", { p_session_hash: sessionHash });
  if (!r) return null;
  return {
    token,
    sessionHash,
    adminId: r.admin_id,
    displayName: r.display_name,
    viaRecovery: r.via_recovery,
    passkeyIds: r.passkey_ids,
    recoveryCodesLeft: Number(r.recovery_codes_left),
  };
});

/** For admin pages. Every admin database function re-checks the session as well. */
export async function requireAdmin(opts: { allowRecovery?: boolean } = {}): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (s.viaRecovery && !opts.allowRecovery) redirect("/admin/security");
  return s;
}

export async function logoutAdmin(): Promise<void> {
  const s = await getAdminSession();
  if (s) {
    const db = await getDb();
    await db.service("admin_logout", { p_session_hash: s.sessionHash });
  }
  (await cookies()).set(ADMIN_COOKIE, "", { ...adminCookieOptions, maxAge: 0 });
}

// ---------------------------------------------------------------------------
// Logged-in admin: add a passkey (after a recovery login), step-up
// ---------------------------------------------------------------------------
export async function addPasskeyOptions(): Promise<Challenge<PublicKeyCredentialCreationOptionsJSON>> {
  const s = await requireAdmin({ allowRecovery: true });
  const options = await passkeyRegistrationOptions(s.adminId, s.passkeyIds);
  return { challengeId: await storeChallenge("register", options.challenge, s.adminId), options };
}

export async function addPasskeyVerify(challengeId: string, response: RegistrationResponseJSON): Promise<boolean> {
  const s = await requireAdmin({ allowRecovery: true });
  const r = await verifyRegistration("register", challengeId, response);
  if (!r || r.adminId !== s.adminId) return false;
  const db = await getDb();
  await db.service("admin_add_passkey", { p_session_hash: s.sessionHash, ...r.args });
  return true;
}

export async function stepupOptions(): Promise<Challenge<PublicKeyCredentialRequestOptionsJSON>> {
  const s = await requireAdmin();
  const options = await generateAuthenticationOptions({
    rpID: rp().rpID,
    userVerification: "required",
    allowCredentials: s.passkeyIds.map((id) => ({ id })),
  });
  return { challengeId: await storeChallenge("stepup", options.challenge, s.adminId), options };
}

export async function stepupVerify(challengeId: string, response: AuthenticationResponseJSON): Promise<boolean> {
  const s = await requireAdmin();
  const v = await verifyAssertion("stepup", challengeId, response);
  if (!v || v.adminId !== s.adminId || v.challengeAdminId !== s.adminId) return false;
  const db = await getDb();
  await db.service("admin_stepup", {
    p_session_hash: s.sessionHash,
    p_credential_id: v.credentialId,
    p_new_counter: v.newCounter,
  });
  return true;
}
