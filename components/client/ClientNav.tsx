"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function ClientNav() {
  const path = usePathname();
  const post = useSearchParams().get("post");
  const items = [
    { href: "/dashboard", label: "الرئيسية", on: path === "/dashboard" },
    { href: "/posts", label: "المنشورات", on: path === "/posts" || (path === "/replies" && post !== "all") },
    { href: "/replies?post=all", label: "الردود العامة", on: path === "/replies" && post === "all" },
    { href: "/activity", label: "السجل", on: path === "/activity" },
    { href: "/settings", label: "الحساب", on: path === "/settings" },
  ];
  return (
    <nav aria-label="القائمة الرئيسية" className="client-nav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.on ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
