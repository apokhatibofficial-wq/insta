"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RobotImg } from "@/components/robot/RobotImg";
import { IconWarning, IconX } from "@/components/ui/icons";
import { groupCode } from "@/lib/codes";
import { addDays, formatDate } from "@/lib/dates";
import { createClientAction } from "../../actions";

type Created = { id: string; public_id: string; name: string; ends_on: string; code: string };

export function NewClientDrawer({ today, onClose }: { today: string; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    if (created) router.refresh();
    onClose();
  };

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    if (ref.current && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      ref.current.animate([{ transform: "translateX(-24px)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], {
        duration: 420,
        easing: "cubic-bezier(.16,1,.3,1)",
      });
    }
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created]);

  const nameOk = name.trim().length >= 2;
  const startOk = start <= today && start >= addDays(today, -30);
  const end = addDays(startOk ? start : today, 29);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameOk || !startOk) {
      setTried(true);
      return;
    }
    setBusy(true);
    setError("");
    const r = await createClientAction({ name, startsOn: start, note });
    setBusy(false);
    if (r.ok) setCreated(r.data);
    else setError("تعذّر إنشاء العميل. تحقّق من البيانات وحاول مرة أخرى.");
  };

  return (
    <div className="drawer-root">
      <div className="overlay-bg" onClick={close} />
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="new-title" className="drawer">
        <header className="drawer-head">
          <h2 id="new-title">{created ? "رمز الدخول" : "عميل جديد"}</h2>
          <button type="button" className="btn btn-icon" onClick={close} aria-label="إغلاق" style={{ width: 40, minHeight: 40 }}>
            <IconX />
          </button>
        </header>

        {!created ? (
          <form onSubmit={submit} noValidate className="drawer-form">
            <div className="drawer-body">
              <label className="field">
                <span className="field-label">اسم العميل أو النشاط التجاري</span>
                <input
                  ref={nameRef}
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: اسم العميل"
                  maxLength={120}
                  aria-invalid={tried && !nameOk}
                />
                {tried && !nameOk && <span className="field-error">اكتب اسمًا من حرفين على الأقل.</span>}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="field">
                  <span className="field-label">بداية الاشتراك</span>
                  <input
                    type="date"
                    dir="ltr"
                    className="input mono"
                    value={start}
                    min={addDays(today, -30)}
                    max={today}
                    onChange={(e) => setStart(e.target.value)}
                    aria-invalid={tried && !startOk}
                    style={{ fontSize: 15, padding: "0 12px" }}
                  />
                </label>
                <div className="field">
                  <span className="field-label">ينتهي في</span>
                  <div className="readonly-box">{formatDate(end)}</div>
                </div>
              </div>
              <p className="field-hint" style={{ margin: "-10px 0 0" }}>
                المدة 30 يومًا ثابتة، تبدأ 00:00 وتنتهي 23:59 بتوقيت دمشق.
                {tried && !startOk && <span className="field-error"> اختر تاريخًا بين اليوم و30 يومًا مضت.</span>}
              </p>
              <label className="field">
                <span className="field-label">
                  ملاحظة الدفع <span style={{ color: "var(--muted-2)", fontWeight: 400 }}>(اختياري)</span>
                </span>
                <textarea
                  rows={3}
                  className="input"
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="مثال: دُفع نقدًا — الشهر الأول"
                />
                <span className="field-hint">لا تكتب أرقام بطاقات أو بيانات مصرفية.</span>
              </label>
              {error && (
                <div role="alert" className="callout callout-danger">
                  {error}
                </div>
              )}
            </div>
            <footer className="drawer-foot">
              <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>
                {busy && <span className="spinner" aria-hidden />}
                إنشاء العميل وتوليد الرمز
              </button>
              <button type="button" className="btn" onClick={close}>
                إلغاء
              </button>
            </footer>
          </form>
        ) : (
          <div className="drawer-form">
            <div className="drawer-body" style={{ gap: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <RobotImg name="robot-wink" className="" style={{ width: 84, filter: "var(--robot-filter)" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 600 }}>أُنشئ حساب {created.name}</span>
                  <span style={{ fontSize: 14, color: "var(--muted-2)" }}>
                    <span dir="ltr" className="mono">
                      {created.public_id}
                    </span>{" "}
                    · حتى {formatDate(created.ends_on)}
                  </span>
                </div>
              </div>
              <div className="code-card">
                <span style={{ fontSize: 14, color: "var(--text-3)" }}>رمز الدخول</span>
                <div className="code-display" data-testid="new-code">
                  {groupCode(created.code)}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    navigator.clipboard?.writeText(created.code).catch(() => {});
                    setCopied(true);
                  }}
                >
                  {copied ? "نُسخ ✓" : "نسخ الرمز"}
                </button>
              </div>
              <div role="note" className="callout callout-warning">
                <IconWarning />
                <span>
                  يظهر الرمز هذه المرة فقط، ولا يُخزَّن إلا بصيغة مشفّرة لا يمكن استرجاعها. إذا ضاع فستحتاج إلى توليد رمز جديد،
                  وعندها يتوقف القديم فورًا. أرسله للعميل عبر قناة خاصة.
                </span>
              </div>
            </div>
            <footer className="drawer-foot">
              <button type="button" className="btn" onClick={close} style={{ flex: 1, fontWeight: 600 }}>
                تم، أغلق النافذة
              </button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
