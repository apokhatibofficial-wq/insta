import { after, NextResponse, type NextRequest } from "next/server";
import { env, metaConfigured } from "@/server/env";
import { handleComment } from "@/server/instagram/process";
import { parseComments, verifySignature } from "@/server/instagram/webhook";
import { timingSafeEqualStr } from "@/lib/codes";

// Meta webhooks (Instagram API with Instagram Login).

// Verification handshake when the webhook is configured in the App Dashboard.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const expected = env().META_WEBHOOK_VERIFY_TOKEN;
  if (
    expected &&
    q.get("hub.mode") === "subscribe" &&
    timingSafeEqualStr(q.get("hub.verify_token") ?? "", expected) &&
    /^[0-9A-Za-z_-]{1,128}$/.test(q.get("hub.challenge") ?? "")
  ) {
    return new NextResponse(q.get("hub.challenge"), { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse(null, { status: 403 });
}

export async function POST(request: NextRequest) {
  if (!metaConfigured()) return new NextResponse(null, { status: 503 });
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 1_000_000) return new NextResponse(null, { status: 413 });
  if (!(await verifySignature(env().META_APP_SECRET!, raw, request.headers.get("x-hub-signature-256")))) {
    return new NextResponse(null, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const comments = parseComments(payload);
  // Answer Meta at once; replies are sent after the response (waitUntil on Workers).
  after(async () => {
    for (const c of comments) {
      await handleComment(c).catch((e) => console.error("webhook comment failed:", e instanceof Error ? e.name : "unknown"));
    }
  });
  return NextResponse.json({ ok: true });
}
