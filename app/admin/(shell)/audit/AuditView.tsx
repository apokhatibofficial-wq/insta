"use client";

import { useState } from "react";
import { IconSearch } from "@/components/ui/icons";
import { formatDayMonth, formatTime } from "@/lib/dates";
import { actorLabel, auditTag, auditText, type AuditTag } from "@/lib/labels";
import type { AuditRow } from "@/server/admin/clients";

const TONE: Record<string, string> = {
  green: "var(--success)",
  amber: "var(--warning)",
  red: "var(--danger)",
  gray: "var(--muted-2)",
  soft: "var(--text-2)",
};

function detail(e: AuditRow): string {
  const d = e.details ?? {};
  const parts: string[] = [];
  if (typeof d.note === "string" && d.note) parts.push(`«${d.note}»`);
  if (typeof d.count === "number") parts.push(`${d.count} جلسة`);
  if (typeof d.recovery_codes_left === "number") parts.push(`تبقّى ${d.recovery_codes_left} من رموز الاسترداد`);
  return parts.join(" · ");
}

export function AuditView({ entries }: { entries: AuditRow[] }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<AuditTag | "all">("all");
  const query = q.trim().toLowerCase();
  const list = entries.filter((e) => {
    if (f !== "all" && auditTag(e.action).key !== f) return false;
    if (!query) return true;
    return (e.client_name ?? "").toLowerCase().includes(query) || (e.client_public_id ?? "").toLowerCase().includes(query);
  });

  return (
    <>
      <div className="page-title">
        <h1>سجل العمليات</h1>
        <p>كل تغيير إداري وكل حدث أمني، مسجّل ولا يمكن تعديله أو حذفه. التوقيت بتوقيت دمشق.</p>
      </div>

      <div className="toolbar">
        <div className="search" style={{ maxWidth: 360, minWidth: 240 }}>
          <IconSearch />
          <input type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم العميل أو المعرّف" aria-label="بحث في السجل" />
        </div>
        <div role="tablist" aria-label="نوع العملية" className="segmented" style={{ maxWidth: "100%" }}>
          {(
            [
              ["all", "الكل"],
              ["sub", "اشتراكات"],
              ["code", "رموز الدخول"],
              ["acct", "حسابات"],
              ["bot", "أتمتة"],
              ["sec", "أمان"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={f === k} onClick={() => setF(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <div style={{ minWidth: 860 }} role="table" aria-label="سجل العمليات">
            <div className="grid-row grid-head audit-grid" role="row">
              <span role="columnheader">الوقت</span>
              <span role="columnheader">العميل</span>
              <span role="columnheader">العملية</span>
              <span role="columnheader">المنفّذ</span>
            </div>
            {list.map((e) => {
              const t = auditTag(e.action);
              const txt = auditText(e);
              const det = detail(e);
              return (
                <div key={e.id} className="grid-row audit-grid" role="row" data-testid="audit-row">
                  <span role="cell" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14 }}>{formatDayMonth(e.created_at)}</span>
                    <span className="mono" style={{ fontSize: 13, color: "var(--muted-2)" }}>
                      {formatTime(e.created_at)}
                    </span>
                  </span>
                  <span role="cell" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{e.client_name ?? "—"}</span>
                    {e.client_public_id && (
                      <span dir="ltr" className="mono" style={{ fontSize: 12, color: "var(--muted-2)", textAlign: "right" }}>
                        {e.client_public_id}
                      </span>
                    )}
                  </span>
                  <span role="cell" style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                    <span className="tag" style={{ ["--c" as string]: TONE[t.tone], height: 24, fontSize: 12, marginTop: 2 }}>
                      {t.label}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 15, lineHeight: 1.55 }}>{txt.text}</span>
                      {det && <span style={{ fontSize: 13, color: "var(--muted-2)", lineHeight: 1.6 }}>{det}</span>}
                    </span>
                  </span>
                  <span role="cell" style={{ fontSize: 14, color: "var(--text-2)" }}>
                    {actorLabel(e.actor_type)}
                  </span>
                </div>
              );
            })}
            {list.length === 0 && <div className="table-empty">لا توجد عمليات تطابق البحث.</div>}
          </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-2)", lineHeight: 1.7 }}>
        لا يحتوي السجل على رموز الدخول أو مفاتيح إنستغرام أو أي بيانات مصرفية.
      </p>
    </>
  );
}
