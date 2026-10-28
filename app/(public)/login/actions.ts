"use server";

import { z } from "zod";
import { loginWithCode, type LoginResult } from "@/server/auth/client";
import { assertSameOrigin } from "@/server/http";

export async function loginAction(code: unknown): Promise<LoginResult | { ok: false; error: "server" }> {
  try {
    await assertSameOrigin();
    const parsed = z.string().max(200).safeParse(code);
    return await loginWithCode(parsed.success ? parsed.data : "");
  } catch {
    // Never leak details; the UI shows the generic message.
    return { ok: false, error: "server" };
  }
}
