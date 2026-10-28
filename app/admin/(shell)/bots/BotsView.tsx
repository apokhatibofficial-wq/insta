"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { BotRow } from "@/server/admin/clients";
import { botAllowedAction, globalStopAction } from "../../actions";

type Group = "run" | "err" | "stop" | "wait";

function describe(b: BotRow): { state: string; why: string; color: string; g: Group } {
  switch (b.bot_state) {
    case "run":
      return { state: "يعمل", why: "كل الشروط مستوفاة", color: "var(--success)", g: "run" };
    case "wait":
      return { state: "بانتظار الربط", why: "لم يربط العميل حساب إنستغرام بعد", color: "var(--muted)", g: "wait" };
    case "err":
      return { state: "متوقف: خلل في الربط", why: "انتهت صلاحية إذن إنستغرام · على العميل إعادة الربط", color: "var(--danger)", g: "err" };
    case "admin":
      return { state: "متوقف: إيقاف إداري", why: "أوقفته أنت", color: "var(--warning)", g: "stop" };
    case "sub_expired":
      return {
        state: "متوقف: الاشتراك منتهٍ",
        why: b.subscription.ends_on ? `انتهى في ${formatDate(b.subscription.ends_on)}` : "لا يوجد اشتراك",
        color: "var(--warning)",
        g: "stop",
      };
    case "sub_paused":
      return { state: "متوقف: الاشتراك موقوف", why: "أوقفتَ الاشتراك مؤقتًا", color: "var(--warning)", g: "stop" };
    case "disabled":
      return { state: "متوقف: الحساب معطّل", why: "عطّلتَ حساب العميل", color: "var(--warning)", g: "stop" };
    case "paused":
      return { state: "أوقفه العميل", why: "من لوحة العميل", color: "var(--muted)", g: "stop" };
    case "global":
      return { state: "متوقف: إيقاف شامل", why: "كل البوتات متوقفة بأمر منك", color: "var(--danger)", g: "stop" };
  }
}

const loadLabel = (n: number) => (n === 0 ? "لا ردود" : n === 1 ? "رد واحد" : n === 2 ? "ردّان" : n <= 10 ? `${n} ردود` : `${n} ردًا`);

export function BotsView({ bots, globalStop }: { bots: BotRow[]; globalStop: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Group | "all">("all");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setConfirm(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const rows = bots.map((b) => ({ b, d: describe(b) }));
  const list = rows.filter((x) => filter === "all" || x.d.g === filter);
  const count = (g: Group) => rows.filter((x) => x.d.g === g).length;

  const act = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.ok) router.refresh();
      else setError("تعذّر تنفيذ العملية. حاول مرة أخرى.");
    });

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>البوتات</h1>
          <p>حالة الأتمتة لكل عميل، وسبب التوقف إن وُجد.</p>
        </div>
        <button
          type="button"
          className={`btn ${globalStop ? "btn-danger-solid" : "btn-danger-outline"}`}
          disabled={pending}
          onClick={() => (globalStop ? act(() => globalStopAction(false)) : setConfirm(true))}
          style={{ gap: 8, fontWeight: 600 }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "currentColor" }} aria-hidden />
          {globalStop ? "استئناف كل البوتات" : "إيقاف كل البوتات"}
        </button>
      </div>

      {globalStop && (
        <div role="alert" className="callout callout-danger" style={{ color: "var(--danger-heading)", fontSize: 15 }}>
          كل البوتات متوقفة الآن بأمر منك. لا يُرسل أي رد حتى تستأنفها. العملاء يرون رسالة «متوقف مؤقتًا من فريق KHATIB».
        </div>
      )}
      {error && (
        <div role="alert" className="callout callout-danger">
          {error}
        </div>
      )}

      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        {(
          [
            ["run", "يعمل", "var(--success)"],
            ["err", "خلل يحتاج العميل", "var(--danger)"],
            ["stop", "متوقف", "var(--warning)"],
            ["wait", "بانتظار الربط", "var(--muted)"],
          ] as const
        ).map(([k, label, color]) => (
          <button key={k} type="button" className="stat" aria-pressed={filter === k} onClick={() => setFilter((f) => (f === k ? "all" : k))}>
            <span className="stat-label">
              <span className="dot" style={{ background: color }} />
              {label}
            </span>
            <span className="stat-value">{count(k)}</span>
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <div style={{ minWidth: 900 }} role="table" aria-label="البوتات">
            <div className="grid-row grid-head bots-grid" role="row">
              <span role="columnheader">العميل</span>
              <span role="columnheader">الحالة</span>
              <span role="columnheader">آخر 24 ساعة</span>
              <span role="columnheader">آخر رد</span>
              <span role="columnheader">السماح</span>
            </div>
            {list.map(({ b, d }) => (
              <div key={b.id} className="grid-row bots-grid" role="row" data-testid="bot-row">
                <Link href={`/admin/clients/${b.id}`} className="row-link" role="cell">
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{b.name}</span>
                  <span dir="ltr" className="mono" style={{ fontSize: 12, color: "var(--muted-2)", textAlign: "right" }}>
                    {b.public_id}
                    {b.username ? ` · @${b.username}` : ""}
                  </span>
                </Link>
                <span role="cell" style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: d.color }}>
                    <span className="dot" style={{ background: d.color }} />
                    {d.state}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--muted-2)", lineHeight: 1.6 }}>{d.why}</span>
                </span>
                <span role="cell" style={{ fontSize: 14, color: "var(--text-2)" }}>
                  {loadLabel(Number(b.load_24h))}
                </span>
                <span role="cell" style={{ fontSize: 14, color: "var(--muted)" }}>
                  {b.last_reply ? formatDateTime(b.last_reply) : "—"}
                </span>
                <span role="cell">
                  <button
                    type="button"
                    role="switch"
                    className="switch switch-sm"
                    aria-checked={b.admin_allowed}
                    aria-label={`السماح بأتمتة ${b.name}`}
                    disabled={pending}
                    onClick={() => act(() => botAllowedAction(b.id, !b.admin_allowed))}
                  />
                </span>
              </div>
            ))}
            {list.length === 0 && <div className="table-empty">{bots.length ? "لا توجد بوتات في هذه الحالة." : "لا يوجد عملاء بعد."}</div>}
          </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-2)", lineHeight: 1.7 }}>
        مفتاح «السماح» إيقاف إداري فوري. لا يمكن للعميل تجاوزه، ويُسجَّل في سجل العمليات.
      </p>

      {confirm && (
        <div className="overlay">
          <div className="overlay-bg" onClick={() => setConfirm(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="dlgT" className="dialog" style={{ maxWidth: 440, gap: 16 }}>
            <h2 id="dlgT">إيقاف كل البوتات؟</h2>
            <p style={{ color: "var(--muted)" }}>
              يتوقف الرد على كل العملاء فورًا، للطوارئ فقط (مثلًا عند خلل في الردود أو تحذير من Meta). الإعدادات تبقى كما هي.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-danger-solid"
                disabled={pending}
                onClick={() => {
                  setConfirm(false);
                  act(() => globalStopAction(true));
                }}
                style={{ flex: "none", padding: "0 20px" }}
              >
                إيقاف الكل
              </button>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
