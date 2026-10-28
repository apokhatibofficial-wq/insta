import "server-only";
import { env } from "../env";

// Minimal client for the Instagram API with Instagram Login.
// Tokens are only ever sent in the Authorization header or POST body, never logged.

export class GraphError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | null,
    public readonly subcode: number | null,
  ) {
    super(`graph_error_${status}_${code ?? ""}`);
    this.name = "GraphError";
  }
  /** The token is invalid/expired/revoked → the client must reconnect. */
  get tokenRejected() {
    return this.code === 190;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: number; error_subcode?: number } };
  if (!res.ok || body.error) throw new GraphError(res.status, body.error?.code ?? null, body.error?.error_subcode ?? null);
  return body as T;
}

const graph = (path: string) => `${env().META_GRAPH_URL}/${env().META_GRAPH_VERSION}${path}`;
const timeout = () => AbortSignal.timeout(10_000);

export function authorizeUrl(state: string, redirectUri: string): string {
  const e = env();
  const u = new URL("/oauth/authorize", e.META_AUTHORIZE_URL);
  u.searchParams.set("client_id", e.META_APP_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; userId: string }> {
  const e = env();
  const res = await fetch(`${e.META_OAUTH_URL}/oauth/access_token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: e.META_APP_ID!,
      client_secret: e.META_APP_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
    signal: timeout(),
  });
  const body = await parse<{ access_token?: string; user_id?: string | number; data?: { access_token: string; user_id: string | number }[] }>(res);
  const d = body.data?.[0] ?? body;
  if (!d.access_token) throw new GraphError(res.status, null, null);
  return { accessToken: d.access_token, userId: String(d.user_id) };
}

export async function longLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const u = new URL(`${env().META_GRAPH_URL}/access_token`);
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", env().META_APP_SECRET!);
  u.searchParams.set("access_token", shortToken);
  const b = await parse<{ access_token: string; expires_in: number }>(await fetch(u, { signal: timeout() }));
  return { accessToken: b.access_token, expiresIn: b.expires_in };
}

export async function refreshToken(token: string): Promise<{ accessToken: string; expiresIn: number }> {
  const u = new URL(`${env().META_GRAPH_URL}/refresh_access_token`);
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", token);
  const b = await parse<{ access_token: string; expires_in: number }>(await fetch(u, { signal: timeout() }));
  return { accessToken: b.access_token, expiresIn: b.expires_in };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The professional account id used by webhooks (entry.id), and its username. */
export async function me(token: string): Promise<{ userId: string; username: string }> {
  const b = await parse<{ user_id?: string | number; id?: string; username?: string }>(
    await fetch(graph("/me?fields=user_id,username"), { headers: auth(token), signal: timeout() }),
  );
  return { userId: String(b.user_id ?? b.id), username: b.username ?? "" };
}

export async function subscribeWebhooks(token: string, igUserId: string): Promise<void> {
  await parse(
    await fetch(graph(`/${igUserId}/subscribed_apps?subscribed_fields=comments`), { method: "POST", headers: auth(token), signal: timeout() }),
  );
}

export async function unsubscribeWebhooks(token: string, igUserId: string): Promise<void> {
  await parse(await fetch(graph(`/${igUserId}/subscribed_apps`), { method: "DELETE", headers: auth(token), signal: timeout() }));
}

export type Media = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
};

export async function recentMedia(token: string, limit = 50): Promise<Media[]> {
  const fields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count";
  const b = await parse<{ data?: Media[] }>(
    await fetch(graph(`/me/media?fields=${fields}&limit=${limit}`), { headers: auth(token), signal: timeout() }),
  );
  return b.data ?? [];
}

/** Public reply under the comment. */
export async function replyToComment(token: string, commentId: string, message: string): Promise<void> {
  await parse(
    await fetch(graph(`/${encodeURIComponent(commentId)}/replies`), {
      method: "POST",
      headers: { ...auth(token), "content-type": "application/json" },
      body: JSON.stringify({ message }),
      signal: timeout(),
    }),
  );
}

/** Private reply: one message to the commenter, within 7 days of the comment. */
export async function privateReply(token: string, igUserId: string, commentId: string, text: string): Promise<void> {
  await parse(
    await fetch(graph(`/${igUserId}/messages`), {
      method: "POST",
      headers: { ...auth(token), "content-type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
      signal: timeout(),
    }),
  );
}
