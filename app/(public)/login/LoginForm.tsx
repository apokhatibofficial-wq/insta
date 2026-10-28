"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MiniRobot } from "@/components/robot/MiniRobot";
import { IconClock, IconEye, IconEyeOff, IconInfo } from "@/components/ui/icons";
import { normalizeAccessCode } from "@/lib/codes";
import { loginAction } from "./actions";

type Status = "idle" | "loading" | "error" | "locked";

const BUBBLE: Record<Status, string> = {
  idle: "أدخل رمزك، وسأفتح لك لوحتك.",
  loading: "لحظة، أتحقّق من الرمز…",
  error: "لم ينجح الأمر هذه المرة. لنجرّب مرة أخرى.",
  locked: "لنأخذ استراحة قصيرة، ثم نحاول مجددًا.",
};

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

export function LoginForm() {
  const router = useRouter();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [left, setLeft] = useState<number | null>(null);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);
  const [focused, setFocused] = useState(false);
  const [serverError, setServerError] = useState(false);
  const lastStatus = useRef<Status>("idle");

  useEffect(() => {
    if (!formRef.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    Array.from(formRef.current.children).forEach((el, i) =>
      el.animate(
        [
          { opacity: 0, transform: "translateY(14px)", filter: "blur(4px)" },
          { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" },
        ],
        { duration: 900, delay: 120 + i * 80, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" },
      ),
    );
  }, []);

  useEffect(() => {
    if (lastStatus.current !== status && bubbleRef.current && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      bubbleRef.current.animate([{ opacity: 0, filter: "blur(5px)" }, { opacity: 1, filter: "blur(0px)" }], {
        duration: 600,
        easing: "cubic-bezier(.16,1,.3,1)",
      });
    }
    lastStatus.current = status;
  }, [status]);

  useEffect(() => {
    if (status !== "locked") return;
    const tick = () => {
      const s = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockLeft(s);
      if (s === 0) {
        setStatus("idle");
        setValue("");
        setLeft(null);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [status, lockUntil]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value || status === "loading" || status === "locked") return;
    setStatus("loading");
    setServerError(false);
    const r = await loginAction(value);
    if (r.ok) {
      router.replace("/dashboard");
      return;
    }
    if ("error" in r) {
      setServerError(true);
      setStatus("error");
      return;
    }
    if (r.locked) {
      setLockUntil(Date.now() + r.retryAfterS * 1000);
      setStatus("locked");
      return;
    }
    setLeft(r.maxFailures - r.failures);
    setStatus("error");
  };

  const loading = status === "loading";
  const locked = status === "locked";
  const isError = status === "error";
  const disabled = !value || loading || locked;
  const remain =
    isError && !serverError && left !== null && left <= 2
      ? left === 2
        ? " تبقّت محاولتان."
        : left === 1
          ? " تبقّت محاولة واحدة."
          : ""
      : "";
  const inputId = `${uid}-code`;
  const msgId = `${uid}-msg`;

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="login-form">
      <div className="login-hero">
        <MiniRobot width={150} pose={isError || locked ? "point" : "wink"} look={focused ? [-4, 4] : [0, 0]} />
        <div className="led-bubble login-bubble">
          <span className="login-bubble-tail" aria-hidden />
          <p ref={bubbleRef} aria-live="polite">
            {BUBBLE[status]}
          </p>
        </div>
      </div>

      <div className="login-heading">
        <h1>الدخول إلى لوحتك</h1>
        <p>أدخل رمز الدخول الذي استلمته عند تفعيل اشتراكك.</p>
      </div>

      <div className="login-field">
        <label htmlFor={inputId}>رمز الدخول</label>
        <div style={{ position: "relative" }}>
          <input
            id={inputId}
            name="code"
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => {
              setValue(normalizeAccessCode(e.target.value));
              if (status === "error") setStatus("idle");
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={locked}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            placeholder="••••••••••"
            aria-invalid={isError}
            aria-describedby={msgId}
            maxLength={64}
            className="login-input"
          />
          <button
            type="button"
            className="login-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "إخفاء الرمز" : "إظهار الرمز"}
            disabled={locked}
          >
            {show ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
        <div id={msgId} className="login-msg">
          {isError && (
            <span className="login-msg-error">
              <IconInfo />
              <span>{serverError ? "تعذّر الاتصال الآن. حاول مرة أخرى بعد قليل." : `تعذّر الدخول. تحقّق من الرمز وحاول مرة أخرى.${remain}`}</span>
            </span>
          )}
          {locked && (
            <span className="login-msg-locked" role="alert">
              <IconClock />
              <span>محاولات كثيرة متتالية. يمكنك المحاولة بعد {mmss(lockLeft)}.</span>
            </span>
          )}
          {!isError && !locked && <span style={{ color: "var(--muted-2)" }}>الرمز حسّاس لحالة الأحرف. لا تشاركه مع أحد.</span>}
        </div>
      </div>

      <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={disabled} aria-busy={loading} data-loading={loading || undefined}>
        {loading && <span className="spinner" aria-hidden />}
        <span>{loading ? "جارٍ التحقق…" : locked ? `متاح بعد ${mmss(lockLeft)}` : "دخول"}</span>
      </button>

      <p className="login-footer">لا تملك رمزًا؟ تواصل مع فريق KHATIB لتفعيل اشتراكك.</p>
    </form>
  );
}
