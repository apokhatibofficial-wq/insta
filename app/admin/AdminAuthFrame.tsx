import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AdminAuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-auth">
      <header className="login-header" style={{ gap: 16 }}>
        <Brand />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle />
          <span className="admin-badge">لوحة الإدارة</span>
        </div>
      </header>
      <main className="admin-auth-main">{children}</main>
    </div>
  );
}
