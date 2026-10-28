import type { Metadata } from "next";
import { damascusToday } from "@/lib/dates";
import { listClients } from "@/server/admin/clients";
import { ClientsView } from "./ClientsView";

export const metadata: Metadata = { title: "العملاء — KHATIB Admin" };

export default async function ClientsPage() {
  const clients = await listClients();
  return <ClientsView clients={clients} today={damascusToday()} />;
}
