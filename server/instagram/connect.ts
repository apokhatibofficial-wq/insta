import "server-only";
import { hmac, randomToken, toByteaHex } from "@/lib/codes";
import { getClientContext, currentSessionHash } from "../client/context";
import { getDb } from "../db";
import { DbError } from "../db/types";
import { env, metaConfigured } from "../env";
import { decryptToken, encryptToken, toBytea } from "./crypto";
import * as graph from "./graph";

const redirectUri = () => `${env().WEBAUTHN_ORIGIN}/connect/instagram/callback`;
const stateHash = async (state: string) => toByteaHex(await hmac(env().SESSION_SECRET, `oauth-state:${state}`));

/** Starts the Meta login for the signed-in client; returns the URL to redirect to. */
export async function startConnect(): Promise<string> {
  if (!metaConfigured()) throw new DbError("not_configured");
  await getClientContext();
  const state = randomToken(24);
  const db = await getDb();
  await db.service("oauth_state_create", { p_session_hash: await currentSessionHash(), p_state_hash: await stateHash(state) });
  return graph.authorizeUrl(state, redirectUri());
}

export type ConnectError = "denied" | "state" | "in_use" | "failed" | "not_configured";

/** Completes the OAuth callback. The tenant comes from the single-use state bound to this session. */
export async function finishConnect(code: string | null, state: string | null, error: string | null): Promise<ConnectError | null> {
  if (!metaConfigured()) return "not_configured";
  if (error) return "denied";
  if (!code || !state || state.length > 100 || code.length > 2000) return "state";
  const db = await getDb();
  const clientId = await db.service<string | null>("oauth_state_consume", {
    p_session_hash: await currentSessionHash(),
    p_state_hash: await stateHash(state),
  });
  if (!clientId) return "state";

  try {
    const short = await graph.exchangeCode(code, redirectUri());
    const long = await graph.longLivedToken(short.accessToken);
    const account = await graph.me(long.accessToken);
    await graph.subscribeWebhooks(long.accessToken, account.userId);
    const enc = await encryptToken(env().TOKEN_ENCRYPTION_KEY!, clientId, long.accessToken);
    await db.service("client_ig_connect", {
      p_client_id: clientId,
      p_ig_user_id: account.userId,
      p_username: account.username,
      p_token_ciphertext: toBytea(enc.ciphertext),
      p_token_iv: toBytea(enc.iv),
      p_token_expires_at: new Date(Date.now() + long.expiresIn * 1000).toISOString(),
    });
    await syncMedia(clientId).catch(() => {});
    return null;
  } catch (e) {
    if (e instanceof DbError && e.code === "ig_account_in_use") return "in_use";
    console.error("instagram connect failed:", e instanceof Error ? e.name : "unknown");
    return "failed";
  }
}

type TokenRow = { client_id: string; ig_user_id: string; token_ciphertext: string; token_iv: string; status: string };

async function tokenFor(clientId: string): Promise<{ token: string; igUserId: string } | null> {
  const db = await getDb();
  const t = await db.service<TokenRow | null>("ig_token_get", { p_client_id: clientId });
  if (!t) return null;
  return { token: await decryptToken(env().TOKEN_ENCRYPTION_KEY!, clientId, t.token_ciphertext, t.token_iv), igUserId: t.ig_user_id };
}

/** Pulls the latest posts into ig_posts. Marks the connection for reconnect if Meta rejects the token. */
export async function syncMedia(clientId: string): Promise<number> {
  const t = await tokenFor(clientId);
  if (!t) return 0;
  const db = await getDb();
  try {
    const items = await graph.recentMedia(t.token);
    return db.service<number>("ig_posts_upsert", { p_client_id: clientId, p_items: items });
  } catch (e) {
    if (e instanceof graph.GraphError && e.tokenRejected) await db.service("ig_mark_needs_reconnect", { p_client_id: clientId });
    throw e;
  }
}

/** Best-effort: stop Meta sending this account's comments before the token is deleted. */
export async function unsubscribeClient(clientId: string): Promise<void> {
  if (!metaConfigured()) return;
  const t = await tokenFor(clientId).catch(() => null);
  if (t) await graph.unsubscribeWebhooks(t.token, t.igUserId).catch(() => {});
}

/** Refreshes long-lived tokens that are >24h old and expire within 10 days. */
export async function refreshDueTokens(): Promise<{ refreshed: number; rejected: number }> {
  const db = await getDb();
  const due = await db.service<string[]>("ig_tokens_due_refresh");
  let refreshed = 0;
  let rejected = 0;
  for (const clientId of due) {
    try {
      const t = await tokenFor(clientId);
      if (!t) continue;
      const r = await graph.refreshToken(t.token);
      const enc = await encryptToken(env().TOKEN_ENCRYPTION_KEY!, clientId, r.accessToken);
      await db.service("ig_token_update", {
        p_client_id: clientId,
        p_token_ciphertext: toBytea(enc.ciphertext),
        p_token_iv: toBytea(enc.iv),
        p_token_expires_at: new Date(Date.now() + r.expiresIn * 1000).toISOString(),
      });
      refreshed++;
    } catch (e) {
      if (e instanceof graph.GraphError && e.tokenRejected) {
        await db.service("ig_mark_needs_reconnect", { p_client_id: clientId });
        rejected++;
      }
    }
  }
  return { refreshed, rejected };
}
