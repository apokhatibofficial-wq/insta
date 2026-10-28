import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { startConnect } from "@/server/instagram/connect";

// GET /connect/instagram → Meta's login page (Instagram Login), with a
// single-use state bound to this client session.
export async function GET(request: NextRequest) {
  try {
    return NextResponse.redirect(await startConnect(), 303);
  } catch (e) {
    unstable_rethrow(e);
    return NextResponse.redirect(new URL("/dashboard?ig=failed", request.url), 303);
  }
}
