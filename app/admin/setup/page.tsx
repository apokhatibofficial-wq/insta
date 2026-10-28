import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/server/env";
import { getAdminSession, getSetupState } from "@/server/auth/admin";
import { AdminAuthFrame } from "../AdminAuthFrame";
import { Setup } from "./Setup";

export const metadata: Metadata = { title: "إعداد دخول المدير — KHATIB" };

export default async function SetupPage() {
  const s = await getSetupState();
  // Closed for good once setup is complete, or if no setup token is configured.
  // The admin who just finished keeps the same component on screen, so the
  // one-time recovery codes are not lost when the session cookie refreshes the page.
  if (s.setup_complete) {
    if (!(await getAdminSession())) notFound();
  } else if (!env().ADMIN_SETUP_TOKEN) {
    notFound();
  }
  return (
    <AdminAuthFrame>
      <Setup initialPasskeys={s.passkeys} completed={s.setup_complete} />
    </AdminAuthFrame>
  );
}
