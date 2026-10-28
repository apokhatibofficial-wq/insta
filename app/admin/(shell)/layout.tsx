import { requireAdmin } from "@/server/auth/admin";
import { AdminSidebar } from "./AdminSidebar";

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
  return (
    <div className="admin-shell">
      <AdminSidebar name={s.displayName} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
