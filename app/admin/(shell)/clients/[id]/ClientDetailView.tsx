"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withStepUp } from "@/components/admin/webauthn";
import { IconArrowEnd, IconCheck, IconChevronStart, IconLinkBroken, IconX } from "@/components/ui/icons";
import { groupCode } from "@/lib/codes";
import { addDays, damascusToday, formatDate, formatDateTime } from "@/lib/dates";
import { auditMeta, auditText, botReason, bucket, sessionsLabel, subChip } from "@/lib/labels";
import type { ClientDetail } from "@/server/admin/types";
import {
  accountActiveAction,
  botAllowedAction,
  endSessionsAction,
  endSubscriptionAction,
  pauseAction,
  regenerateCodeAction,
  renewAction,
  revokeCodeAction,
  type ActionResult,
} from "../../../actions";

type Modal = null | "renew" | "end" | "regenAsk" | "regenShow";

const ERRORS: Record<string, string> = {
  stepup_failed: "لم يكتمل التحقق بـ Passkey، فلم يتغيّر شيء.",
  stepup_required: "يلزم التحقق بـ Passkey لهذه العملية.",
  no_current_subscription: "لا يوجد اشتراك فعّال لهذه العملية.",
  renewal_too_far: "لا يمكن التجديد لأكثر من سنة مقدمًا.",
  admin_auth_required: "انتهت جلسة الإدارة. ادخل مرة أخرى.",
};

export function ClientDetailView({ c }: { c: ClientDetail }) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [note, setNote] = useState("");
  const [newCode, setNewCode] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modal && modal !== "regenShow") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };

  async function act<T>(fn: () => Promise<ActionResult<T>>, ok: (d: T) => void) {
    setBusy(true);
    setError("");
    const r = await fn();
    setBusy(false);
    if (r.ok) {
      ok(r.data);
      startTransition(() => router.refresh());
    } else {
      if (r.error === "admin_auth_required") router.replace("/admin/login");
      setError(ERRORS[r.error] ?? "تعذّر تنفيذ العملية. حاول مرة أخرى.");
    }
  }

  const sub = c.subscription;
  const b = bucket(sub);
  const chip = subChip(sub);
  const subOk = b === "active" || b === "soon";
  const expired = b === "expired";
  const left = sub.days_left ?? 0;
  const total = Math.max(1, sub.total_days ?? 30);
  const renewFrom = expired ? sub.today : addDays(sub.ends_on ?? sub.today, 1);
  const renewEnd = addDays(renewFrom, 29);
  const accountOn = c.status === "active";
  const allow = c.bot?.admin_allowed ?? false;
  const running = c.bot_state === "run";
  const codeActive = c.code?.status === "active";
  const sessions = Number(c.sessions.active);

  const checks = [
    { ok: accountOn, label: "الحساب مفعّل" },
    { ok: subOk, label: "الاشتراك فعّال" },
    { ok: allow, label: "مسموح من الأدمن" },
    { ok: c.ig.status === "ok", label: "ربط إنستغرام صالح" },
  ];

  return (
    <>
      <nav aria-label="مسار التنقل" className="crumbs">
        <Link href="/admin/clients">العملاء</Link>
        <IconChevronStart />
        <span>{c.name}</span>
      </nav>

      <header className="detail-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h1>{c.name}</h1>
            <span className={`chip tone-${chip.tone}`} style={{ height: 28, padding: "0 12px" }}>
              {chip.label}
            </span>
            {!accountOn && (
              <span className="chip tone-gray" style={{ height: 28, padding: "0 12px" }}>
                الحساب معطّل
              </span>
            )}
          </div>
          <div className="detail-meta">
            <span dir="ltr" className="mono">
              {c.public_id}
            </span>
            <span>عميل منذ {formatDate(damascusToday(new Date(c.created_at)))}</span>
            {c.ig.username && <span dir="ltr">@{c.ig.username}</span>}
          </div>
        </div>
        <button
          type="button"
          className={`btn ${accountOn ? "btn-danger-outline" : ""}`}
          disabled={busy}
          onClick={() =>
            act(
              () => accountActiveAction(c.id, !accountOn),
              () => flash(accountOn ? "عُطّل الحساب" : "فُعّل الحساب"),
            )
          }
        >
          {accountOn ? "تعطيل الحساب" : "إعادة تفعيل الحساب"}
        </button>
      </header>

      {error && (
        <div role="alert" className="callout callout-danger">
          {error}
        </div>
      )}

      {c.ig.status === "needs_reconnect" && (
        <div role="alert" className="ig-alert">
          <IconLinkBroken style={{ color: "var(--danger)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <span className="ig-alert-title">البوت متوقف: انتهت صلاحية ربط إنستغرام</span>
            <span className="ig-alert-body">
              لم تعد Meta تقبل تفويض هذا الحساب{c.ig_updated_at ? ` منذ ${formatDateTime(c.ig_updated_at)}` : ""}. يحتاج العميل
              إلى إعادة الربط من لوحته، ولا يمكن إصلاح ذلك من هنا.
            </span>
          </div>
        </div>
      )}

      <div className="detail-grid">
        <section aria-labelledby="sub-h" className="panel">
          <div className="panel-head">
            <h2 id="sub-h">الاشتراك</h2>
            <span className="panel-note">30 يومًا · بتوقيت دمشق</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 15, color: "var(--text-3)" }}>
                {expired ? "انتهى الاشتراك" : b === "paused" ? "الاشتراك موقوف" : "الأيام المتبقية"}
              </span>
              <span className="mono" style={{ fontSize: 28, fontWeight: 500 }} data-testid="days-left">
                {expired ? "0" : `${Math.min(left, total)}/${total}`}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={expired ? 0 : Math.min(left, total)}
              aria-label="الأيام المتبقية من الاشتراك"
              className="progress"
            >
              <div style={{ width: `${Math.round((expired ? 0 : Math.min(1, left / total)) * 100)}%`, background: `var(--c)` }} className={`tone-${chip.tone}`} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted-2)" }}>
              <span>{sub.starts_on ? formatDate(sub.starts_on) : "—"}</span>
              <span>{sub.ends_on ? formatDate(sub.ends_on) : "—"}</span>
            </div>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-primary" onClick={() => setModal("renew")} disabled={busy}>
              تجديد 30 يومًا
            </button>
            {(subOk || b === "paused") && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  act(
                    () => pauseAction(c.id, b !== "paused"),
                    () => flash(b === "paused" ? "استُؤنف الاشتراك" : "أُوقف الاشتراك"),
                  )
                }
              >
                {b === "paused" ? "استئناف الاشتراك" : "إيقاف مؤقت"}
              </button>
            )}
            {!expired && (
              <button type="button" className="btn btn-danger-ghost" onClick={() => setModal("end")} disabled={busy}>
                إنهاء الاشتراك
              </button>
            )}
          </div>
        </section>

        <section aria-labelledby="code-h" className="panel">
          <div className="panel-head">
            <h2 id="code-h">رمز الدخول والجلسات</h2>
            <span className={`fg-${codeActive ? "green" : "red"}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
              <span className="dot" style={{ width: 6, height: 6, background: "currentColor" }} />
              {codeActive ? "فعّال" : "مُبطَل"}
            </span>
          </div>
          <dl className="kv">
            <dt>الرمز</dt>
            <dd dir="ltr" className="mono" style={{ textAlign: "right", color: "var(--text-3)" }}>
              {codeActive ? "•••• •••• ••••" : "—"}
            </dd>
            <dt>أُنشئ</dt>
            <dd>{c.code ? formatDate(damascusToday(new Date(c.code.created_at))) : "—"}</dd>
            <dt>آخر دخول</dt>
            <dd>{c.sessions.last_login ? formatDateTime(c.sessions.last_login) : "لم يدخل بعد"}</dd>
            <dt>جلسات نشطة</dt>
            <dd data-testid="sessions">{sessionsLabel(sessions)}</dd>
          </dl>
          <div className="panel-actions">
            <button type="button" className="btn" onClick={() => setModal("regenAsk")} disabled={busy}>
              توليد رمز جديد
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || sessions === 0}
              onClick={() => act(() => endSessionsAction(c.id), () => flash("أُنهيت الجلسات"))}
            >
              إنهاء كل الجلسات
            </button>
            <button
              type="button"
              className="btn btn-danger-ghost"
              disabled={busy || !codeActive}
              onClick={() => act(() => withStepUp(() => revokeCodeAction(c.id)), () => flash("أُبطل الرمز"))}
            >
              إبطال الرمز
            </button>
          </div>
        </section>

        <section aria-labelledby="bot-h" className="panel">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 id="bot-h" className="panel-title">
                الأتمتة
              </h2>
              <span className={running ? "fg-green" : "fg-red"} style={{ fontSize: 14 }} data-testid="bot-reason">
                {botReason(c.bot_state)}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              className="switch"
              aria-checked={allow}
              aria-label="السماح بالأتمتة لهذا العميل"
              disabled={busy}
              onClick={() => act(() => botAllowedAction(c.id, !allow), () => flash(allow ? "أُوقفت الأتمتة" : "سُمح بالأتمتة"))}
            />
          </div>
          <p className="panel-note" style={{ margin: 0, lineHeight: 1.7 }}>
            إيقاف إداري فوري يتجاوز إعدادات العميل. حتى لو كان المفتاح مفعّلًا، يرفض الخادم تشغيل الأتمتة إذا انتهى الاشتراك أو كان
            الحساب معطّلًا.
          </p>
          <ul className="checks">
            {checks.map((k) => (
              <li key={k.label}>
                <span className={`check ${k.ok ? "tone-green" : "tone-red"}`}>{k.ok ? <IconCheck size={12} sw={3} /> : <IconX size={12} sw={3} />}</span>
                <span style={{ color: k.ok ? "var(--text-soft)" : "var(--danger-heading)" }}>{k.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="log-h" className="panel">
          <div className="panel-head">
            <h2 id="log-h">سجل التغييرات</h2>
            <span className="panel-note">لا يمكن تعديله أو حذفه</span>
          </div>
          <ol className="timeline">
            {c.log.map((e, i) => {
              const t = auditText(e);
              return (
                <li key={i}>
                  <span className="timeline-dot">
                    <span className={`tone-${t.tone}`} />
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{t.text}</span>
                    <span style={{ fontSize: 12, color: "var(--muted-2)" }}>{auditMeta(e)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {modal && (
        <div className="overlay">
          <div className="overlay-bg" onClick={() => modal !== "regenShow" && setModal(null)} />
          <section role="dialog" aria-modal="true" aria-labelledby="m-title" className="dialog">
            <h2 id="m-title">
              {{ renew: "تجديد الاشتراك", end: "إنهاء الاشتراك الآن؟", regenAsk: "توليد رمز دخول جديد؟", regenShow: "الرمز الجديد" }[modal]}
            </h2>

            {modal === "renew" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="renew-box">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--muted-2)" }}>الانتهاء الحالي</span>
                    <span style={{ fontSize: 15 }}>{sub.ends_on ? formatDate(sub.ends_on) : "—"}</span>
                  </div>
                  <IconArrowEnd style={{ color: "var(--muted-2)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--muted-2)" }}>الانتهاء الجديد</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--success)" }}>{formatDate(renewEnd)}</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--muted-2)" }}>
                  {expired
                    ? "الاشتراك منتهٍ، لذا تبدأ المدة الجديدة من اليوم."
                    : "الاشتراك ما زال فعّالًا، لذا تُضاف المدة بعد تاريخ الانتهاء الحالي دون خسارة أي يوم."}
                </p>
                <label className="field">
                  <span style={{ fontSize: 14, color: "var(--text-2)" }}>
                    ملاحظة الدفع <span style={{ color: "var(--muted-2)" }}>(اختياري)</span>
                  </span>
                  <textarea
                    rows={2}
                    className="input"
                    value={note}
                    maxLength={300}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="مثال: دُفع نقدًا — تشرين الثاني"
                  />
                </label>
              </div>
            )}
            {modal === "end" && (
              <p>
                تتوقف الأتمتة فورًا، ويرى العميل صفحة «انتهى الاشتراك» عند دخوله. لن تُحذف بياناته، ويمكنك تجديد الاشتراك لاحقًا. سيُطلب
                منك التحقق بـ Passkey.
              </p>
            )}
            {modal === "regenAsk" && (
              <p>
                سيتوقف الرمز الحالي فورًا، وتُنهى كل الجلسات المفتوحة. ستحتاج إلى إرسال الرمز الجديد للعميل. سيُطلب منك التحقق بـ
                Passkey.
              </p>
            )}
            {modal === "regenShow" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="code-display new-code-box" data-testid="regen-code">
                  {groupCode(newCode)}
                </div>
                <span style={{ fontSize: 13, lineHeight: 1.7, color: "var(--warning-text)" }}>
                  يظهر هذه المرة فقط. انسخه الآن وأرسله عبر قناة خاصة.
                </span>
              </div>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className={`btn ${modal === "end" ? "btn-danger-solid" : "btn-primary"}`}
                disabled={busy}
                onClick={() => {
                  if (modal === "renew") {
                    act(
                      () => renewAction(c.id, note),
                      (s) => {
                        setModal(null);
                        setNote("");
                        flash(`جُدّد حتى ${s.ends_on ? formatDate(s.ends_on) : ""}`);
                      },
                    );
                  } else if (modal === "end") {
                    act(
                      () => withStepUp(() => endSubscriptionAction(c.id)),
                      () => {
                        setModal(null);
                        flash("أُنهي الاشتراك");
                      },
                    ).then(() => setModal((m) => (m === "end" ? null : m)));
                  } else if (modal === "regenAsk") {
                    act(
                      () => withStepUp(() => regenerateCodeAction(c.id)),
                      (code) => {
                        setNewCode(code);
                        setModal("regenShow");
                      },
                    ).then(() => setModal((m) => (m === "regenAsk" ? null : m)));
                  } else {
                    navigator.clipboard?.writeText(newCode).catch(() => {});
                    setNewCode("");
                    setModal(null);
                    flash("نُسخ الرمز");
                  }
                }}
              >
                {busy && <span className="spinner" aria-hidden />}
                {{ renew: "تأكيد التجديد", end: "إنهاء الاشتراك", regenAsk: "توليد وإبطال القديم", regenShow: "نسخ الرمز وإغلاق" }[modal]}
              </button>
              {modal !== "regenShow" && (
                <button type="button" className="btn" onClick={() => setModal(null)}>
                  إلغاء
                </button>
              )}
            </div>
          </section>
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
