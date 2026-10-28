"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { logoutClient } from "@/server/auth/client";
import { currentSessionHash, getClientContext } from "@/server/client/context";
import { DbError } from "@/server/db";
import { assertSameOrigin } from "@/server/http";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string; words?: string[] };

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<Result<T>> {
  try {
    await assertSameOrigin();
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DbError) return { ok: false, error: e.code };
    if (e instanceof z.ZodError) return { ok: false, error: "invalid_input" };
    console.error("client action failed:", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "server" };
  }
}

export async function logoutAction() {
  await assertSameOrigin();
  await logoutClient();
  redirect("/login");
}

// The tenant is always the session's; nothing in the request selects it.

export async function setBotEnabledAction(enabled: unknown) {
  return run(async () => {
    const { clientId, db } = await getClientContext();
    await db.asClient(clientId, "client_set_bot_enabled", { p_enabled: z.boolean().parse(enabled) });
  }, ["/dashboard"]);
}

const ruleInput = z.object({
  id: z.string().uuid().nullable(),
  enabled: z.boolean(),
  scope: z.enum(["all", "posts"]),
  postIds: z.array(z.string().uuid()).max(100),
  keywords: z.array(z.string().max(60)).max(30),
  publicReply: z.string().max(1000),
  dmText: z.string().max(1000),
  linkUrl: z.string().max(500),
});

export type SavedRule = {
  id: string;
  enabled: boolean;
  scope: "all" | "posts";
  public_reply: string;
  dm_text: string;
  link_url: string;
  keywords: string[];
  post_ids: string[];
};

export async function saveRuleAction(input: unknown): Promise<Result<SavedRule>> {
  const r = await run(async () => {
    const v = ruleInput.parse(input);
    const { clientId, db } = await getClientContext();
    return db.asClient<{ ok: boolean; error?: string; words?: string[]; rule?: SavedRule }>(clientId, "client_rule_save", {
      p_id: v.id,
      p_enabled: v.enabled,
      p_scope: v.scope,
      p_post_ids: v.postIds,
      p_keywords: v.keywords,
      p_public_reply: v.publicReply,
      p_dm_text: v.dmText,
      p_link_url: v.linkUrl,
    });
  }, ["/replies", "/posts", "/dashboard"]);
  if (!r.ok) return r;
  if (!r.data.ok) return { ok: false, error: r.data.error ?? "server", words: r.data.words };
  return { ok: true, data: r.data.rule! };
}

export async function deleteRuleAction(id: unknown) {
  return run(async () => {
    const { clientId, db } = await getClientContext();
    await db.asClient(clientId, "client_rule_delete", { p_id: z.string().uuid().parse(id) });
  }, ["/replies", "/posts", "/dashboard"]);
}

export async function setCooldownAction(hours: unknown) {
  return run(async () => {
    const { clientId, db } = await getClientContext();
    await db.asClient(clientId, "client_set_cooldown", { p_hours: z.union([z.literal(1), z.literal(6), z.literal(24)]).parse(hours) });
  }, ["/replies"]);
}

export async function endDeviceAction(sessionId: unknown) {
  return run(async () => {
    const { db } = await getClientContext();
    await db.service("client_devices_end", {
      p_session_hash: await currentSessionHash(),
      p_session_id: z.string().uuid().nullable().parse(sessionId),
    });
  }, ["/settings"]);
}

export async function disconnectInstagramAction() {
  return run(async () => {
    const { db } = await getClientContext();
    await db.service("client_ig_disconnect", { p_session_hash: await currentSessionHash() });
  }, ["/settings", "/dashboard"]);
}
