import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { SubSummary } from "@/server/admin/types";
import { CLIENT_COOKIE } from "../http";
import { hashSessionToken, requireClient } from "../auth/client";
import { getDb } from "../db";

export type Me = {
  id: string;
  public_id: string;
  name: string;
  subscription: SubSummary;
  ig: { status: "ok" | "needs_reconnect" | "none"; username: string | null; updated_at?: string } | null;
  bot: { client_enabled: boolean } | null;
};

/** The signed-in client (validated session) and their own data, read under RLS. */
export const getClientContext = cache(async () => {
  const clientId = await requireClient();
  const db = await getDb();
  const me = await db.asClient<Me>(clientId, "client_me");
  return { clientId, db, me };
});

/** Hash of the current session token, for session-scoped server functions. */
export async function currentSessionHash(): Promise<string> {
  await requireClient();
  const token = (await cookies()).get(CLIENT_COOKIE)?.value ?? "";
  return hashSessionToken(token);
}
