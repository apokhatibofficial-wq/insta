import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession, getSetupState } from "@/server/auth/admin";
import { AdminAuthFrame } from "../AdminAuthFrame";
import { AdminLogin } from "./AdminLogin";

export const metadata: Metadata = { title: "دخول المدير — KHATIB" };

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin/clients");
  if (!(await getSetupState()).setup_complete) redirect("/admin/setup");
  return (
    <AdminAuthFrame>
      <AdminLogin />
    </AdminAuthFrame>
  );
}
