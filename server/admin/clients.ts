import "server-only";
import { z } from "zod";
import { generateAccessCode } from "@/lib/codes";
import { damascusToday, addDays } from "@/lib/dates";
import { hashAccessCode } from "../auth/client";
import { requireAdmin } from "../auth/admin";
import { getDb } from "../db";
import type { ClientDetail, ClientRow, SubSummary } from "./types";

// Every function: page-level admin check here + the same check again inside
// the database function (p_session_hash), in the same transaction as the change.

const uuid = z.string().uuid();
const note = z.string().trim().max(300).optional().default("");

export const createClientInput = z.object({
  name: z.string().trim().min(2).max(120),
  startsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => {
      const today = damascusToday();
      return d <= today && d >= addDays(today, -30);
    }),
  note,
});

async function ctx() {
  const s = await requireAdmin();
  return { db: await getDb(), p_session_hash: s.sessionHash };
}

export async function listClients(): Promise<ClientRow[]> {
  const { db, p_session_hash } = await ctx();
  return db.service<ClientRow[]>("admin_clients_list", { p_session_hash });
}

export async function getClientDetail(clientId: string): Promise<ClientDetail> {
  const { db, p_session_hash } = await ctx();
  return db.service<ClientDetail>("admin_client_detail", { p_session_hash, p_client_id: uuid.parse(clientId) });
}

/** Creates the client + first period + access code. The plain code is returned once and never stored. */
export async function createClient(input: z.input<typeof createClientInput>) {
  const v = createClientInput.parse(input);
  const { db, p_session_hash } = await ctx();
  const code = generateAccessCode();
  const created = await db.service<{ id: string; public_id: string; name: string; ends_on: string }>(
    "admin_client_create",
    {
      p_session_hash,
      p_name: v.name,
      p_starts_on: v.startsOn,
      p_note: v.note,
      p_code_hash: await hashAccessCode(code),
    },
  );
  return { ...created, code };
}

export async function renewSubscription(clientId: string, paymentNote: string) {
  const { db, p_session_hash } = await ctx();
  return db.service<SubSummary>("admin_subscription_renew", {
    p_session_hash,
    p_client_id: uuid.parse(clientId),
    p_note: note.parse(paymentNote),
  });
}

export async function setSubscriptionPaused(clientId: string, paused: boolean) {
  const { db, p_session_hash } = await ctx();
  return db.service<SubSummary>("admin_subscription_set_paused", {
    p_session_hash,
    p_client_id: uuid.parse(clientId),
    p_paused: z.boolean().parse(paused),
  });
}

/** Requires a fresh passkey step-up (checked and consumed in the database). */
export async function endSubscription(clientId: string) {
  const { db, p_session_hash } = await ctx();
  return db.service<SubSummary>("admin_subscription_end", { p_session_hash, p_client_id: uuid.parse(clientId) });
}

/** Requires step-up. Revokes the old code and all sessions; returns the new plain code once. */
export async function regenerateCode(clientId: string) {
  const { db, p_session_hash } = await ctx();
  const code = generateAccessCode();
  await db.service("admin_code_regenerate", {
    p_session_hash,
    p_client_id: uuid.parse(clientId),
    p_code_hash: await hashAccessCode(code),
  });
  return code;
}

/** Requires step-up. */
export async function revokeCode(clientId: string) {
  const { db, p_session_hash } = await ctx();
  await db.service("admin_code_revoke", { p_session_hash, p_client_id: uuid.parse(clientId) });
}

export async function endClientSessions(clientId: string) {
  const { db, p_session_hash } = await ctx();
  return db.service<{ ended: number }>("admin_sessions_end", { p_session_hash, p_client_id: uuid.parse(clientId) });
}

export async function setAccountActive(clientId: string, active: boolean) {
  const { db, p_session_hash } = await ctx();
  return db.service<ClientRow>("admin_account_set_active", {
    p_session_hash,
    p_client_id: uuid.parse(clientId),
    p_active: z.boolean().parse(active),
  });
}

export async function setBotAllowed(clientId: string, allowed: boolean) {
  const { db, p_session_hash } = await ctx();
  return db.service<{ bot_state: string }>("admin_bot_set_allowed", {
    p_session_hash,
    p_client_id: uuid.parse(clientId),
    p_allowed: z.boolean().parse(allowed),
  });
}
