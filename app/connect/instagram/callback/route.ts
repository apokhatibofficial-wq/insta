import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { finishConnect } from "@/server/instagram/connect";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  let result: string;
  try {
    result = (await finishConnect(q.get("code"), q.get("state"), q.get("error"))) ?? "connected";
  } catch (e) {
    unstable_rethrow(e);
    result = "failed";
  }
  // Never echo Meta's parameters back; only our own result code.
  return NextResponse.redirect(new URL(`/dashboard?ig=${result}`, request.url), 303);
}
