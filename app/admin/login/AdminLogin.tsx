"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { IconCheck, IconLock, IconPasskey } from "@/components/ui/icons";
import { normalizeRecoveryCode } from "@/lib/codes";
import { loginOptionsAction, loginVerifyAction, recoveryLoginAction } from "../actions";

type Phase = "idle" | "busy" | "error" | "locked" | "done";

const TITLES: Record<Exclude<Phase, "locked">, string> = {
  idle: "دخول المدير",
  busy: "بانتظار جهازك…",
  error: "دخول المدير",
  done: "تم التحقق",
};
const SUBS: Record<Exclude<Phase, "locked">, string> = {
  idle: "استخدم Passkey المسجّل على جهازك: بصمة الإصبع أو الوجه أو قفل الشاشة.",
  busy: "أكمل التحقق في النافذة التي فتحها المتصفح.",
  error: "يمكنك المحاولة مرة أخرى.",
  done: "جارٍ فتح لوحة الإدارة…",
};

export function AdminLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<"passkey" | "recovery">("passkey");
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [retry, setRetry] = useState(0);

  const fail = (r: { ok: boolean; locked?: boolean; retryAfterS?: number } | null) => {
    if (r?.locked) {
      setRetry(Math.ceil((r.retryAfterS ?? 900) / 60));
      setPhase("locked");
    } else setPhase("error");
  };

  const signIn = async () => {
    setPhase("busy");
    const o = await loginOptionsAction();
    if (!o.ok) return fail(null);
    let resp;
    try {
      resp = await startAuthentication({ optionsJSON: o.data.options });
    } catch {
      return fail(null);
    }
    const v = await loginVerifyAction(o.data.challengeId, resp);
    if (v.ok && v.data.ok) {
      setPhase("done");
      router.replace("/admin/clients");
    } else fail(v.ok ? v.data : null);
  };

  const submitCode = async () => {
    setPhase("busy");
    const v = await recoveryLoginAction(code);
    if (v.ok && v.data.ok) {
      setPhase("done");
      router.replace("/admin/security");
    } else fail(v.ok ? v.data : null);
  };

  const busy = phase === "busy";
  const done = phase === "done";
  const codeOk = normalizeRecoveryCode(code).length === 12;
  const key = phase === "locked" ? "error" : phase;

  return (
    <div className="admin-login-box">
      <div className="admin-login-head">
        <div className="admin-login-icon">{done ? <IconCheck size={32} sw={2} style={{ color: "var(--success)" }} /> : <IconPasskey />}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1>{mode === "recovery" && !done ? "الدخول برمز استرداد" : TITLES[key]}</h1>
          <p>{mode === "recovery" && !done ? "اكتب أحد رموز الاسترداد التي حفظتها عند إعداد الحساب." : SUBS[key]}</p>
        </div>
      </div>

      {phase === "error" && (
        <div role="alert" className="callout callout-danger">
          لم يكتمل التحقق. ربما أُلغيت النافذة أو انتهت مهلتها، أو أن المفتاح غير مسجّل لهذه اللوحة.
        </div>
      )}
      {phase === "locked" && (
        <div role="alert" className="callout callout-warning">
          محاولات كثيرة متتالية. حاول مرة أخرى بعد {retry} دقيقة تقريبًا.
        </div>
      )}

      {mode === "passkey" && !done && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button type="button" className="btn btn-primary btn-lg" onClick={signIn} disabled={busy} style={{ fontSize: 17 }}>
            {busy && <span className="spinner" aria-hidden />}
            {busy ? "جارٍ التحقق…" : "الدخول بـ Passkey"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => (setMode("recovery"), setPhase("idle"))} style={{ fontSize: 14 }}>
            فقدت جهازي؟ استخدم رمز استرداد
          </button>
        </div>
      )}

      {mode === "recovery" && !done && (
        <form
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (codeOk && !busy) submitCode();
          }}
        >
          <label htmlFor="rc" style={{ fontSize: 15, fontWeight: 600 }}>
            رمز الاسترداد
          </label>
          <input
            id="rc"
            dir="ltr"
            className="input mono"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={20}
            style={{ minHeight: 56, fontSize: 19, letterSpacing: ".12em", textAlign: "center" }}
          />
          <span className="field-hint">كل رمز يعمل مرة واحدة. بعد الدخول سجّل Passkey جديدًا فورًا.</span>
          <button type="submit" className="btn btn-primary btn-lg" disabled={!codeOk || busy} style={{ fontSize: 17 }}>
            {busy && <span className="spinner" aria-hidden />}
            دخول برمز الاسترداد
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => (setMode("passkey"), setPhase("idle"))} style={{ fontSize: 14 }}>
            العودة إلى Passkey
          </button>
        </form>
      )}

      <div className="admin-login-note">
        <IconLock style={{ flex: "none", marginTop: 3 }} />
        <span>هذه الصفحة للمدير فقط. رموز دخول العملاء لا تعمل هنا، وكل محاولة دخول تُسجَّل.</span>
      </div>
    </div>
  );
}
