"use client";

import { useState } from "react";
import Link from "next/link";
import { RobotImg } from "@/components/robot/RobotImg";
import { addDays, damascusToday, formatDayMonth, formatTime } from "@/lib/dates";
import { eventView, type ClientEvent } from "@/lib/events";

type Filter = "all" | "reply" | "fail" | "set";

const KIND: Record<ClientEvent["kind"], { icon: string; fg: string }> = {
  reply: { icon: "↩", fg: "var(--success)" },
  skip: { icon: "–", fg: "var(--muted)" },
  fail: { icon: "!", fg: "var(--warning)" },
  set: { icon: "✎", fg: "var(--text-2)" },
  sys: { icon: "•", fg: "var(--text-2)" },
};

const matches = (f: Filter, k: ClientEvent["kind"]) =>
  f === "all" || (f === "reply" && (k === "reply" || k === "skip")) || (f === "fail" && k === "fail") || (f === "set" && (k === "set" || k === "sys"));

export function ActivityView({ events, range }: { events: ClientEvent[]; range: 1 | 7 | 30 }) {
  const [filter, setFilter] = useState<Filter>("all");
  const today = damascusToday();
  const yesterday = addDays(today, -1);
  const list = events.filter((e) => matches(filter, e.kind));

  const groups: { day: string; label: string; items: ClientEvent[] }[] = [];
  for (const e of list) {
    const day = damascusToday(new Date(e.created_at));
    let g = groups.find((x) => x.day === day);
    if (!g) {
      const dm = formatDayMonth(e.created_at);
      g = { day, label: day === today ? `اليوم · ${dm}` : day === yesterday ? `أمس · ${dm}` : dm, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  const stats = [
    { label: "ردود أرسلها البوت", value: events.filter((e) => e.kind === "reply").length, fg: "var(--text)" },
    { label: "تعليقات تجاهلها لمنع التكرار", value: events.filter((e) => e.kind === "skip").length, fg: "var(--text)" },
    { label: "تحتاج انتباهك", value: events.filter((e) => e.kind === "fail").length, fg: "var(--warning)" },
  ];

  return (
    <>
      <div className="page-title">
        <h1>السجل</h1>
        <p>كل ما فعله البوت على حسابك، وما لم يستطع فعله ولماذا. الأوقات بتوقيت دمشق.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ padding: "18px 20px", borderRadius: 18, gap: 6 }}>
            <span className="card-label">{s.label}</span>
            <span className="mono" style={{ fontSize: 30, fontWeight: 500, color: s.fg }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div role="tablist" aria-label="نوع الحدث" className="segmented" style={{ maxWidth: "100%" }}>
          {(
            [
              ["all", "الكل"],
              ["reply", "الردود"],
              ["fail", "تحتاج انتباهك"],
              ["set", "التغييرات"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <nav aria-label="المدة" className="segmented">
          {(
            [
              [1, "اليوم"],
              [7, "7 أيام"],
              [30, "30 يومًا"],
            ] as const
          ).map(([k, l]) => (
            <Link key={k} href={`/activity?range=${k}`} aria-current={range === k ? "page" : undefined} className="seg-link" scroll={false}>
              {l}
            </Link>
          ))}
        </nav>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map((g) => (
          <section key={g.day} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--muted)" }}>{g.label}</h2>
            <div className="event-list">
              {g.items.map((e, i) => {
                const v = eventView(e);
                const K = KIND[e.kind];
                return (
                  <div key={i} className="event-row">
                    <span className="event-icon" style={{ color: K.fg, background: `color-mix(in srgb, ${K.fg} 12%, transparent)` }} aria-hidden>
                      {K.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 15, lineHeight: 1.6, textWrap: "pretty" }}>{v.text}</span>
                      {v.fix && <span className="event-fix">{v.fix}</span>}
                    </div>
                    <span className="mono" style={{ flex: "none", fontSize: 13, color: "var(--muted-2)" }}>
                      {formatTime(e.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {list.length === 0 && (
        <div className="empty">
          <RobotImg name="robot-wink" className="" style={{ width: 120, filter: "var(--robot-filter)" }} />
          <span className="empty-title">لا أحداث في هذه الفترة</span>
          <span className="empty-sub">سيظهر هنا كل رد يرسله البوت.</span>
        </div>
      )}
    </>
  );
}
