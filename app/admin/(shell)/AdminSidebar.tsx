"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RobotImg } from "@/components/robot/RobotImg";
import { IconBot, IconCalendar, IconCheck, IconLog, IconUsers } from "@/components/ui/icons";
import { adminLogoutAction } from "../actions";

const NAV = [
  { href: "/admin/clients", label: "العملاء", icon: IconUsers, ready: true },
  { href: "/admin/subscriptions", label: "الاشتراكات", icon: IconCalendar, ready: true },
  { href: "/admin/bots", label: "البوتات", icon: IconBot, ready: true },
  { href: "/admin/audit", label: "سجل العمليات", icon: IconLog, ready: true },
];

export function AdminSidebar({ name }: { name: string }) {
  const path = usePathname();
  return (
    <aside className="admin-side">
      <div className="admin-side-brand">
        <div style={{ position: "relative", width: 44, height: 30, flex: "none" }}>
          <RobotImg name="robot-wink" className="robot-layer" style={{ objectFit: "contain" }} />
        </div>
        <div dir="ltr" className="admin-side-word">
          <span style={{ fontSize: 12, fontWeight: 600 }}>KHATIB</span>
          <span style={{ fontSize: 9, color: "var(--muted-2)" }}>ADMIN</span>
        </div>
      </div>
      <nav className="admin-nav" aria-label="لوحة الإدارة">
        {NAV.map(({ href, label, icon: Icon, ready }) =>
          ready ? (
            <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}>
              <Icon />
              {label}
            </Link>
          ) : (
            <span key={href} aria-disabled="true" title="قريبًا">
              <Icon />
              {label}
              <small>قريبًا</small>
            </span>
          ),
        )}
      </nav>
      <div className="admin-me">
        <div className="admin-me-info">
          <div className="admin-avatar" aria-hidden>
            خ
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
            <span style={{ fontSize: 12, color: "var(--muted-2)", display: "flex", alignItems: "center", gap: 5 }}>
              <IconCheck size={12} style={{ color: "var(--success)" }} />
              دخول بـ Passkey
            </span>
          </div>
        </div>
        <div className="admin-me-actions">
          <form action={adminLogoutAction} style={{ flex: 1 }}>
            <button type="submit" className="btn admin-logout">
              تسجيل الخروج
            </button>
          </form>
          <ThemeToggle className="btn admin-theme" />
        </div>
      </div>
    </aside>
  );
}
