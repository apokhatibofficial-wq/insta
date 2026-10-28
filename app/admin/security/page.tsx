import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/admin";
import { AdminAuthFrame } from "../AdminAuthFrame";
import { Security } from "./Security";

export const metadata: Metadata = { title: "أمان الحساب — KHATIB" };

export default async function SecurityPage() {
  const s = await requireAdmin({ allowRecovery: true });
  return (
    <AdminAuthFrame>
      <Security viaRecovery={s.viaRecovery} codesLeft={s.recoveryCodesLeft} />
    </AdminAuthFrame>
  );
}
