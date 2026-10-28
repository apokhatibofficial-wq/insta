"use server";

import { redirect } from "next/navigation";
import { logoutClient } from "@/server/auth/client";
import { assertSameOrigin } from "@/server/http";

export async function logoutAction() {
  await assertSameOrigin();
  await logoutClient();
  redirect("/login");
}
