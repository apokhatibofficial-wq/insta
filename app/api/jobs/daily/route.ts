import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqualStr } from "@/lib/codes";
import { getDb } from "@/server/db";
import { env, metaConfigured } from "@/server/env";
import { refreshDueTokens, syncMedia } from "@/server/instagram/connect";

// Internal daily job, called by the Worker's cron with CRON_SECRET.
export async function POST(request: NextRequest) {
  const secret = env().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !timingSafeEqualStr(given, secret)) return new NextResponse(null, { status: 401 });

  const db = await getDb();
  const maintenance = await db.service("run_daily_maintenance");
  let tokens = { refreshed: 0, rejected: 0 };
  let synced = 0;
  if (metaConfigured()) {
    tokens = await refreshDueTokens();
    const clients = await db.service<string[]>("ig_connected_clients");
    for (const id of clients.slice(0, 50)) {
      synced += await syncMedia(id).catch(() => 0);
    }
  }
  return NextResponse.json({ maintenance, tokens, synced });
}
