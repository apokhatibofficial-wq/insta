// Pure helpers for Meta webhooks: signature check and payload parsing.

/** X-Hub-Signature-256: "sha256=" + hex(HMAC-SHA256(app secret, raw body)). Constant-time compare. */
export async function verifySignature(appSecret: string, rawBody: ArrayBuffer, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const given = header.slice(7).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export type CommentEvent = {
  accountId: string; // the client's Instagram professional account id (entry.id)
  commentId: string;
  fromId: string | null;
  fromUsername: string | null;
  mediaId: string | null;
  text: string;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

function toComment(accountId: string, value: Obj): CommentEvent | null {
  const from = obj(value.from);
  const media = obj(value.media);
  const commentId = str(value.id) ?? str(value.comment_id);
  if (!commentId) return null;
  return {
    accountId,
    commentId,
    fromId: from ? str(from.id) : null,
    fromUsername: from ? str(from.username) : null,
    mediaId: media ? str(media.id) : null,
    text: str(value.text) ?? "",
  };
}

/**
 * Extracts comment notifications. Meta's docs show two shapes for Instagram
 * Login: fields directly on each entry, or inside entry.changes[]; and the
 * comment id as `id` or `comment_id`. Both are accepted. Anything else is ignored.
 */
export function parseComments(payload: unknown): CommentEvent[] {
  const root = obj(payload);
  if (!root || root.object !== "instagram" || !Array.isArray(root.entry)) return [];
  const out: CommentEvent[] = [];
  for (const e of root.entry.slice(0, 1000)) {
    const entry = obj(e);
    const accountId = entry ? str(entry.id) : null;
    if (!entry || !accountId) continue;
    const changes = Array.isArray(entry.changes) ? entry.changes : [entry];
    for (const c of changes) {
      const ch = obj(c);
      const value = ch ? obj(ch.value) : null;
      if (!ch || !value || (ch.field !== "comments" && ch.field !== "live_comments")) continue;
      const ev = toComment(accountId, value);
      if (ev) out.push(ev);
    }
  }
  return out;
}

/** The private message: DM text plus the product link on its own line. */
export function composeDm(dmText: string | null, link: string | null): string {
  return [dmText?.trim(), link?.trim()].filter(Boolean).join("\n");
}
