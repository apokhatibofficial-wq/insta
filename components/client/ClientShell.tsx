import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logoutAction } from "@/app/(client)/actions";
import { ClientNav } from "./ClientNav";

export function ClientShell({ children, wide = false, narrow = false }: { children: React.ReactNode; wide?: boolean; narrow?: boolean }) {
  return (
    <div>
      <header className="client-top">
        <div className="client-top-inner">
          <Brand />
          <ClientNav />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
            <ThemeToggle className="btn client-icon-btn" />
            <form action={logoutAction}>
              <button type="submit" className="btn client-logout">
                خروج
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className={`client-main${wide ? " client-main-wide" : ""}${narrow ? " client-main-narrow" : ""}`}>{children}</main>
    </div>
  );
}
