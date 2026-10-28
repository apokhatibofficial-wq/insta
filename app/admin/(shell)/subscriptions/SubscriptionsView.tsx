"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowEnd, IconCheck } from "@/components/ui/icons";
import { addDays, daysBetween, formatDate } from "@/lib/dates";
import { bucket, daysLabel, type Bucket } from "@/lib/labels";
import type { ClientRow } from "@/server/admin/types";
import { renewAction } from "../../actions";

const G: Record<Bucket, { label: string; color: string }> = {
  active: { label: "نشط", color: "var(--success)" },
  soon: { label: "ينتهي قريبًا", color: "var(--warning)" },
  expired: { label: "منتهٍ", color: "var(--danger)" },
  paused: { label: "موقوف مؤقتًا", color: "var(--muted)" },
};
const ORDER: Record<Bucket, number> = { expired: 0, soon: 1, paused: 2, active: 3 };

export function SubscriptionsView({ clients, today }: { clients: ClientRow[]; today: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Bucket | "all">("all");
  const [dlg, setDlg] = useState<ClientRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setDlg(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const all = clients
    .map((c) => ({ c, g: bucket(c.subscription), left: c.subscription.days_left ?? 0 }))
    .sort((a, b) => ORDER[a.g] - ORDER[b.g] || a.left - b.left);
  const list = all.filter((x) => filter === "all" || x.g === filter);

  const newFrom = (c: ClientRow) => (bucket(c.subscription) === "expired" ? today : addDays(c.subscription.ends_on ?? today, 1));

  const confirm = async () => {
    if (!dlg) return;
    setBusy(true);
    const r = await renewAction(dlg.id, note);
    setBusy(false);
    if (r.ok) {
      setToast(`جُدّد اشتراك ${dlg.name} حتى ${r.data.ends_on ? formatDate(r.data.ends_on) : ""}`);
      setTimeout(() => setToast(""), 3200);
      setDlg(null);
      router.refresh();
    } else setError("تعذّر التجديد. حاول مرة أخرى.");
  };

  return (
    <>
      <div className="page-title">
        <h1>الاشتراكات</h1>
        <p>كل اشتراك 30 يومًا. اليوم: {formatDate(today)} بتوقيت دمشق.</p>
      </div>
      {error && (
        <div role="alert" className="callout callout-danger">
          {error}
        </div>
      )}

      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        {(["active", "soon", "expired", "paused"] as const).map((k) => (
          <button key={k} type="button" className="stat" aria-pressed={filter === k} onClick={() => setFilter((f) => (f === k ? "all" : k))}>
            <span className="stat-label">
              <span className="dot" style={{ background: G[k].color }} />
              {k === "soon" ? "ينتهي خلال 7 أيام" : G[k].label}
            </span>
            <span className="stat-value">{all.filter((x) => x.g === k).length}</span>
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <div style={{ minWidth: 880 }} role="table" aria-label="الاشتراكات">
            <div className="grid-row grid-head subs-grid" role="row">
              <span role="columnheader">العميل</span>
              <span role="columnheader">الحالة</span>
              <span role="columnheader">المدة المتبقية</span>
              <span role="columnheader">ينتهي في</span>
              <span role="columnheader">
                <span className="sr-only">إجراء</span>
              </span>
            </div>
            {list.map(({ c, g, left }) => {
              const total = Math.max(1, c.subscription.total_days ?? 30);
              const since = c.subscription.ends_on ? daysBetween(c.subscription.ends_on, today) : 0;
              return (
                <div key={c.id} className="grid-row subs-grid" role="row" data-testid="sub-row">
                  <Link href={`/admin/clients/${c.id}`} className="row-link" role="cell">
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{c.name}</span>
                    <span dir="ltr" className="mono" style={{ fontSize: 12, color: "var(--muted-2)", textAlign: "right" }}>
                      {c.public_id}
                    </span>
                  </Link>
                  <span role="cell" className="tag" style={{ ["--c" as string]: G[g].color }}>
                    {G[g].label}
                  </span>
                  <span role="cell" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 14, color: "var(--text-2)" }}>
                      {g === "expired" ? (since <= 0 ? "منتهٍ" : `منتهٍ منذ ${daysLabel(since)}`) : `${left} / ${total} يومًا`}
                    </span>
                    <span className="bar">
                      <span style={{ width: `${g === "expired" ? 0 : Math.min(100, (left / total) * 100)}%`, background: G[g].color }} />
                    </span>
                  </span>
                  <span role="cell" style={{ fontSize: 14, color: "var(--text-2)" }}>
                    {c.subscription.ends_on ? formatDate(c.subscription.ends_on) : "—"}
                  </span>
                  <span role="cell">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setDlg(c);
                        setNote("");
                        setError("");
                      }}
                      style={{ minHeight: 38, height: 38, padding: "0 14px", borderRadius: 10, fontSize: 14 }}
                    >
                      تجديد 30 يومًا
                    </button>
                  </span>
                </div>
              );
            })}
            {list.length === 0 && <div className="table-empty">{clients.length ? "لا توجد اشتراكات في هذه الحالة." : "لا يوجد عملاء بعد."}</div>}
          </div>
        </div>
      </div>

      {dlg && (
        <div className="overlay">
          <div className="overlay-bg" onClick={() => setDlg(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="rT" className="dialog" style={{ gap: 18 }}>
            <h2 id="rT">تجديد اشتراك {dlg.name}</h2>
            <div className="renew-box">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, color: "var(--muted-2)" }}>الانتهاء الحالي</span>
                <span style={{ fontSize: 15 }}>{dlg.subscription.ends_on ? formatDate(dlg.subscription.ends_on) : "—"}</span>
              </div>
              <IconArrowEnd style={{ color: "var(--muted-2)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, color: "var(--muted-2)" }}>الانتهاء الجديد</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--success)" }}>{formatDate(addDays(newFrom(dlg), 29))}</span>
              </div>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
              {bucket(dlg.subscription) === "expired"
                ? "الاشتراك منتهٍ، فتبدأ الفترة الجديدة اليوم وتعود الأتمتة فورًا."
                : "الاشتراك ما زال فعّالًا، فتبدأ الفترة الجديدة في اليوم التالي لانتهاء الحالية. لا يخسر العميل أي يوم."}
            </p>
            <label className="field">
              <span style={{ fontSize: 14, fontWeight: 600 }}>ملاحظة الدفع (اختيارية)</span>
              <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="مثال: دفع نقدي" />
              <span className="field-hint">لا تكتب أرقام بطاقات أو بيانات مصرفية.</span>
            </label>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy} style={{ flex: "none", padding: "0 20px" }}>
                {busy && <span className="spinner" aria-hidden />}
                تأكيد التجديد
              </button>
              <button type="button" className="btn" onClick={() => setDlg(null)}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          <IconCheck size={16} sw={2.6} />
          {toast}
        </div>
      )}
    </>
  );
}
