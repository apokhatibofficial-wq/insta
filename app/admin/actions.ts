"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import * as auth from "@/server/auth/admin";
import * as clients from "@/server/admin/clients";
import { DbError } from "@/server/db";
import { assertSameOrigin } from "@/server/http";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

// WebAuthn JSON is verified cryptographically by SimpleWebAuthn; this only
// bounds its shape and size before it gets there.
const webauthnJson = z
  .looseObject({
    id: z.string().max(1024),
    rawId: z.string().max(1024),
    type: z.literal("public-key"),
    response: z.record(z.string(), z.unknown()),
  })
  .refine((v) => JSON.stringify(v).length < 16_000);
const challengeId = z.string().uuid();
const uuid = z.string().uuid();

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await assertSameOrigin();
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DbError) return { ok: false, error: e.code };
    if (e instanceof z.ZodError) return { ok: false, error: "invalid_input" };
    console.error("admin action failed:", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "server" };
  }
}

// ---- login ----
export async function loginOptionsAction() {
  return run(() => auth.loginOptions());
}
export async function loginVerifyAction(id: string, response: unknown) {
  return run(() =>
    auth.loginWithPasskey(challengeId.parse(id), webauthnJson.parse(response) as unknown as AuthenticationResponseJSON),
  );
}
export async function recoveryLoginAction(code: unknown) {
  return run(() => auth.loginWithRecoveryCode(z.string().max(64).parse(code)));
}
export async function adminLogoutAction() {
  await assertSameOrigin();
  await auth.logoutAdmin();
  redirect("/admin/login");
}

// ---- first-run setup ----
const setupToken = z.string().min(1).max(200);
export async function setupOptionsAction(token: unknown) {
  return run(() => auth.setupRegistrationOptions(setupToken.parse(token)));
}
export async function setupVerifyAction(token: unknown, id: string, response: unknown) {
  return run(() =>
    auth.setupVerifyRegistration(
      setupToken.parse(token),
      challengeId.parse(id),
      webauthnJson.parse(response) as unknown as RegistrationResponseJSON,
    ),
  );
}
export async function setupCompleteAction(token: unknown) {
  return run(() => auth.setupComplete(setupToken.parse(token)));
}

// ---- logged-in passkey management & step-up ----
export async function addPasskeyOptionsAction() {
  return run(() => auth.addPasskeyOptions());
}
export async function addPasskeyVerifyAction(id: string, response: unknown) {
  return run(() =>
    auth.addPasskeyVerify(challengeId.parse(id), webauthnJson.parse(response) as unknown as RegistrationResponseJSON),
  );
}
export async function stepupOptionsAction() {
  return run(() => auth.stepupOptions());
}
export async function stepupVerifyAction(id: string, response: unknown) {
  return run(() =>
    auth.stepupVerify(challengeId.parse(id), webauthnJson.parse(response) as unknown as AuthenticationResponseJSON),
  );
}

// ---- clients ----
export async function createClientAction(input: unknown) {
  return run(async () => {
    const r = await clients.createClient(clients.createClientInput.parse(input));
    revalidatePath("/admin/clients");
    return r;
  });
}

function forClient<T>(id: unknown, fn: (id: string) => Promise<T>) {
  return run(async () => {
    const cid = uuid.parse(id);
    const r = await fn(cid);
    revalidatePath(`/admin/clients/${cid}`);
    revalidatePath("/admin/clients");
    return r;
  });
}

export async function renewAction(id: unknown, note: unknown) {
  return forClient(id, (cid) => clients.renewSubscription(cid, z.string().max(300).parse(note ?? "")));
}
export async function pauseAction(id: unknown, paused: unknown) {
  return forClient(id, (cid) => clients.setSubscriptionPaused(cid, z.boolean().parse(paused)));
}
/** Destructive: the database refuses it without a fresh passkey step-up. */
export async function endSubscriptionAction(id: unknown) {
  return forClient(id, (cid) => clients.endSubscription(cid));
}
/** Destructive (step-up). Returns the new plain code once. */
export async function regenerateCodeAction(id: unknown) {
  return forClient(id, (cid) => clients.regenerateCode(cid));
}
/** Destructive (step-up). */
export async function revokeCodeAction(id: unknown) {
  return forClient(id, (cid) => clients.revokeCode(cid));
}
export async function endSessionsAction(id: unknown) {
  return forClient(id, (cid) => clients.endClientSessions(cid));
}
export async function accountActiveAction(id: unknown, active: unknown) {
  return forClient(id, (cid) => clients.setAccountActive(cid, z.boolean().parse(active)));
}
export async function botAllowedAction(id: unknown, allowed: unknown) {
  return forClient(id, (cid) => clients.setBotAllowed(cid, z.boolean().parse(allowed)));
}
