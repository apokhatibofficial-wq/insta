"use client";

import { IconMoon, IconSun } from "./ui/icons";

/**
 * Not in the designs: a minimal light/dark switch. The choice is stored in a
 * cookie (read on the server, so there is no flash); without a choice the
 * system preference applies.
 */
export function ThemeToggle({ className = "btn btn-icon" }: { className?: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const current =
      root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = current === "light" ? "dark" : "light";
    root.dataset.theme = next;
    document.cookie = `kts_theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  };
  return (
    <button type="button" className={className} onClick={toggle} aria-label="تبديل الوضع الفاتح/الداكن" title="الوضع الفاتح/الداكن">
      <span className="theme-icon-light">
        <IconSun />
      </span>
      <span className="theme-icon-dark">
        <IconMoon />
      </span>
    </button>
  );
}
