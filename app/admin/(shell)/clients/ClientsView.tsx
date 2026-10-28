"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RobotImg } from "@/components/robot/RobotImg";
import { IconKebab, IconPlus, IconSearch } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/dates";
import { botListLabel, bucket, clientsCountLabel, igCell, subChip } from "@/lib/labels";
import type { ClientRow } from "@/server/admin/types";
import { NewClientDrawer } from "./NewClientDrawer";

type Filter = "all" | "active" | "soon" | "expired" | "paused" | "ig";

const FILTERS: [Filter, string][] = [
  ["all", "الكل"],
  ["active", "نشط"],
  ["soon", "ينتهي قريبًا"],
  ["expired", "منتهٍ"],
  ["paused", "موقوف"],
];

export function ClientsView({ clients, today }: { clients: ClientRow[]; today: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [drawer, setDrawer] = useState(false);

  const counts = useMemo(() => {
    const c = { active: 0, soon: 0, expired: 0, paused: 0, ig: 0 };
    for (const cl of clients) {
      c[bucket(cl.subscription)]++;
      if (cl.ig.status !== "ok") c.ig++;
    }
    return c;
  }, [clients]);

  const q = query.trim().toLowerCase();
  const rows = clients.filter((c) => {
    const b = bucket(c.subscription);
    if (filter === "ig" && c.ig.status === "ok") return false;
    if (filter === "active" && !(b === "active" || b === "soon")) return false;
    if ((filter === "soon" || filter === "expired" || filter === "paused") && b !== filter) return false;
    if (q && !(c.name.toLowerCase().includes(q) || c.public_id.toLowerCase().includes(q) || (c.ig.username ?? "").toLowerCase().includes(q)))
      return false;
    return true;
  });

  const stats: { key: Filter; label: string; value: number; color: string }[] = [
    { key: "active", label: "نشط", value: counts.active + counts.soon, color: "var(--success)" },
    { key: "soon", label: "ينتهي خلال 7 أيام", value: counts.soon, color: "var(--warning)" },
    { key: "expired", label: "منتهٍ", value: counts.expired, color: "var(--danger)" },
    { key: "ig", label: "يحتاج ربط إنستغرام", value: counts.ig, color: "var(--muted-2)" },
  ];

  const open = (id: string) => router.push(`/admin/clients/${id}`);

  return (
    <>
      <header className="page-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1>العملاء</h1>
          <p>{clientsCountLabel(clients.length)} · التواريخ بتوقيت دمشق</p>
        </div>
        <button type="button" className="btn btn-primary page-head-btn" onClick={() => setDrawer(true)}>
          <IconPlus />
          عميل جديد
        </button>
      </header>

      <div className="stats">
        {stats.map((s) => (
          <button
            key={s.key}
            type="button"
            className="stat"
            aria-pressed={filter === s.key}
            onClick={() => setFilter((f) => (f === s.key ? "all" : s.key))}
          >
            <span className="stat-label">
              <span className="dot" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="stat-value">{s.value}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search">
          <IconSearch />
          <input
            type="search"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو المعرّف أو حساب إنستغرام"
            aria-label="بحث في العملاء"
          />
        </div>
        <div role="tablist" aria-label="تصفية حسب الحالة" className="segmented">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <div className="table" role="table" aria-label="العملاء">
            <div className="tr th" role="row">
              <span role="columnheader">العميل</span>
              <span role="columnheader">الاشتراك</span>
              <span role="columnheader">إنستغرام</span>
              <span role="columnheader">البوت</span>
              <span role="columnheader">آخر نشاط</span>
              <span role="columnheader">
                <span className="sr-only">خيارات</span>
              </span>
            </div>
            {rows.map((c) => {
              const sub = subChip(c.subscription);
              const ig = igCell(c.ig);
              const bot = botListLabel(c.bot_state);
              return (
                <div key={c.id} className="tr" role="row" onClick={() => open(c.id)} data-testid="client-row">
                  <div role="cell" style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span className="ellipsis" style={{ fontSize: 15, fontWeight: 600 }}>
                      {c.name}
                    </span>
                    <span dir="ltr" className="mono" style={{ fontSize: 12, color: "var(--muted-2)", textAlign: "right" }}>
                      {c.public_id}
                    </span>
                  </div>
                  <div role="cell" style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                    <span className={`chip tone-${sub.tone}`}>{sub.label}</span>
                    <span style={{ fontSize: 12, color: "var(--muted-2)" }}>{sub.meta}</span>
                  </div>
                  <span role="cell" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, minWidth: 0 }} className={`fg-${ig.tone}`}>
                    <span className="dot" style={{ width: 7, height: 7, background: ig.dot }} />
                    <span dir={ig.ltr ? "ltr" : "rtl"} className="ellipsis">
                      {ig.label}
                    </span>
                  </span>
                  <span role="cell" className={`fg-${bot.tone}`} style={{ fontSize: 14 }}>
                    {bot.label}
                  </span>
                  <span role="cell" style={{ fontSize: 13, color: "var(--muted-2)" }}>
                    {c.last_activity ? formatDateTime(c.last_activity) : "—"}
                  </span>
                  <span role="cell">
                    <button
                      type="button"
                      className="btn btn-icon kebab"
                      aria-label={`خيارات ${c.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        open(c.id);
                      }}
                    >
                      <IconKebab />
                    </button>
                  </span>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="empty">
                <RobotImg name="robot-point" className="" style={{ width: 120, opacity: 0.9, filter: "var(--robot-filter)" }} />
                {clients.length === 0 ? (
                  <>
                    <span className="empty-title">لا يوجد عملاء بعد</span>
                    <span className="empty-sub">أنشئ أول عميل لتوليد رمز دخوله.</span>
                    <button type="button" className="btn btn-primary" onClick={() => setDrawer(true)}>
                      <IconPlus />
                      عميل جديد
                    </button>
                  </>
                ) : (
                  <>
                    <span className="empty-title">لا يوجد عملاء يطابقون بحثك</span>
                    <span className="empty-sub">جرّب كلمة أخرى أو اعرض كل الحالات.</span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      مسح البحث والتصفية
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {drawer && <NewClientDrawer today={today} onClose={() => setDrawer(false)} />}
    </>
  );
}
