import type { Metadata } from "next";
import { listAudit } from "@/server/admin/clients";
import { AuditView } from "./AuditView";

export const metadata: Metadata = { title: "سجل العمليات — KHATIB Admin" };

export default async function AuditPage() {
  return <AuditView entries={await listAudit()} />;
}
