import type { Metadata } from "next";
import { damascusToday } from "@/lib/dates";
import { listClients } from "@/server/admin/clients";
import { SubscriptionsView } from "./SubscriptionsView";

export const metadata: Metadata = { title: "الاشتراكات — KHATIB Admin" };

export default async function SubscriptionsPage() {
  return <SubscriptionsView clients={await listClients()} today={damascusToday()} />;
}
