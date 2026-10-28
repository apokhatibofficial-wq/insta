"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  addPasskeyOptionsAction,
  addPasskeyVerifyAction,
  stepupOptionsAction,
  stepupVerifyAction,
  type ActionResult,
} from "@/app/admin/actions";

/** Re-verifies the admin with a passkey right before a destructive action. */
export async function stepUp(): Promise<boolean> {
  const o = await stepupOptionsAction();
  if (!o.ok) return false;
  try {
    const resp = await startAuthentication({ optionsJSON: o.data.options });
    const v = await stepupVerifyAction(o.data.challengeId, resp);
    return v.ok && v.data === true;
  } catch {
    return false;
  }
}

/** Runs a destructive action behind a passkey step-up. */
export async function withStepUp<T>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  if (!(await stepUp())) return { ok: false, error: "stepup_failed" };
  return action();
}

export async function registerExtraPasskey(): Promise<boolean> {
  const o = await addPasskeyOptionsAction();
  if (!o.ok) return false;
  try {
    const resp = await startRegistration({ optionsJSON: o.data.options });
    const v = await addPasskeyVerifyAction(o.data.challengeId, resp);
    return v.ok && v.data === true;
  } catch {
    return false;
  }
}
