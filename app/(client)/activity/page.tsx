import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import type { ClientEvent } from "@/lib/events";
import { getClientContext } from "@/server/client/context";
import { ActivityView } from "./ActivityView";

export const metadata: Metadata = { title: "السجل — KHATIB" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const r = Number((await searchParams).range);
  const range = r === 1 || r === 30 ? r : 7;
  const { clientId, db } = await getClientContext();
  const events = await db.asClient<ClientEvent[]>(clientId, "client_activity", { p_days: range });
  return (
    <ClientShell>
      <ActivityView events={events} range={range} />
    </ClientShell>
  );
}
