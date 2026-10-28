import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getClientDetail } from "@/server/admin/clients";
import { DbError } from "@/server/db";
import { ClientDetailView } from "./ClientDetailView";

export const metadata: Metadata = { title: "تفاصيل العميل — KHATIB Admin" };

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const c = await getClientDetail(id).catch((e: unknown) => {
    if (e instanceof DbError && e.code === "not_found") notFound();
    throw e;
  });
  return <ClientDetailView c={c} />;
}
