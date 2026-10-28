import "server-only";
import { getDb } from "../db";
import { env } from "../env";
import { decryptToken } from "./crypto";
import { GraphError, privateReply, replyToComment } from "./graph";
import { composeDm, type CommentEvent } from "./webhook";

type Decision =
  | { action: "ignore" | "skip"; reason: string }
  | {
      action: "reply";
      client_id: string;
      rule_id: string;
      post_id: string | null;
      post_caption: string | null;
      keyword: string;
      public_reply: string | null;
      dm_text: string | null;
      link_url: string | null;
      ig_user_id: string;
      token_ciphertext: string;
      token_iv: string;
      username: string;
      excerpt: string;
    };

type Outcome = "sent" | "failed" | "none";

/**
 * Handles one comment notification end to end. Idempotent per comment id:
 * Meta retries for up to 36 hours, and a comment must never be answered twice.
 */
export async function handleComment(ev: CommentEvent): Promise<string> {
  const db = await getDb();
  if (!(await db.service<boolean>("webhook_first_seen", { p_key: `comment:${ev.commentId}` }))) return "duplicate";

  const d = await db.service<Decision>("automation_decide", {
    p_account_id: ev.accountId,
    p_media_id: ev.mediaId ?? "",
    p_from_id: ev.fromId,
    p_from_username: ev.fromUsername,
    p_comment_id: ev.commentId,
    p_text: ev.text,
  });
  if (d.action !== "reply") return d.reason;

  const token = await decryptToken(env().TOKEN_ENCRYPTION_KEY!, d.client_id, d.token_ciphertext, d.token_iv);
  const dm = composeDm(d.dm_text, d.link_url);
  let dmOutcome: Outcome = "none";
  let publicOutcome: Outcome = "none";
  let dmError: GraphError | null = null;

  const rejected = async () => {
    await db.service("ig_mark_needs_reconnect", { p_client_id: d.client_id });
    return "token_rejected";
  };

  // Private reply first: it is time-limited (7 days) and one per comment.
  if (dm) {
    try {
      await privateReply(token, d.ig_user_id, ev.commentId, dm);
      dmOutcome = "sent";
    } catch (e) {
      if (e instanceof GraphError && e.tokenRejected) return rejected();
      dmOutcome = "failed";
      dmError = e instanceof GraphError ? e : null;
    }
  }
  if (d.public_reply) {
    try {
      await replyToComment(token, ev.commentId, d.public_reply);
      publicOutcome = "sent";
    } catch (e) {
      if (e instanceof GraphError && e.tokenRejected) return rejected();
      publicOutcome = "failed";
    }
  }

  const base = { username: d.username, excerpt: d.excerpt, post: d.post_caption, keyword: d.keyword };
  const record = (kind: "reply" | "fail", code: string, data: Record<string, unknown>) =>
    db.service("automation_record", {
      p_client_id: d.client_id,
      p_rule_id: d.rule_id,
      p_post_id: d.post_id,
      p_kind: kind,
      p_code: code,
      p_data: { ...base, ...data },
    });

  if (dmOutcome === "sent" || publicOutcome === "sent") {
    await record("reply", "reply.sent", { public: publicOutcome === "sent", dm: dmOutcome === "sent", link: dmOutcome === "sent" && !!d.link_url });
  }
  if (dmOutcome === "failed") {
    await record("fail", "reply.dm_failed", { public_sent: publicOutcome === "sent", error: dmError ? dmError.code : null });
  }
  if (publicOutcome === "failed") {
    await record("fail", "reply.public_failed", {});
  }
  return dmOutcome === "failed" || publicOutcome === "failed" ? "partial" : "replied";
}
