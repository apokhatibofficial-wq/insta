import type { Metadata } from "next";
import { listBots } from "@/server/admin/clients";
import { BotsView } from "./BotsView";

export const metadata: Metadata = { title: "البوتات — KHATIB Admin" };

export default async function BotsPage() {
  const { bots, global_stop } = await listBots();
  return <BotsView bots={bots} globalStop={global_stop} />;
}
