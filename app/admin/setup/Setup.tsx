"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { IconPasskey, IconWarning } from "@/components/ui/icons";
import { groupCode } from "@/lib/codes";
import { setupCompleteAction, setupOptionsAction, setupVerifyAction } from "../actions";

// Not in the designs: first-run bootstrap, styled like the admin login.
// Token → passkey 1 → passkey 2 → 10 recovery codes shown once.
export function Setup({ initialPasskeys, completed }: { initialPasskeys: number; completed: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [verified, setVerified] = useState(false);
  const [count, setCount] = useState(initialPasskeys);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const register = async () => {
    setBusy(true);
    setError("");
    const o = await setupOptionsAction(token);
    if (!o.ok) {
      setBusy(false);
      setVerified(false);
      setError(o.error === "admin_auth_required" ? "رمز الإعداد غير صحيح." : "تعذّر بدء التسجيل.");
      return;
    }
    setVerified(true);
    try {
      const resp = await startRegistration({ optionsJSON: o.data.options });
      const v = await setupVerifyAction(token, o.data.challengeId, resp);
      if (v.ok && v.data.ok) setCount(v.data.passkeys);
      else setError("لم يكتمل تسجيل المفتاح. حاول مرة أخرى.");
    } catch {
      setError("أُلغيت النافذة أو انتهت مهلتها. حاول مرة أخرى.");
    }
    setBusy(false);
  };

  const finish = async () => {
    setBusy(true);
    const r = await setupCompleteAction(token);
    setBusy(false);
    if (r.ok) setCodes(r.data);
    else setError("تعذّر إكمال الإعداد.");
  };

  if (codes) {
    return (
      <div className="admin-login-box" style={{ maxWidth: 480 }}>
        <div className="admin-login-head">
          <h1>رموز الاسترداد</h1>
          <p>احفظ هذه الرموز العشرة في مكان آمن خارج هذا الجهاز. كل رمز يعمل مرة واحدة إذا فقدت مفاتيحك.</p>
        </div>
        <ol className="recovery-grid" dir="ltr">
          {codes.map((c) => (
            <li key={c} className="mono">
              {groupCode(c, 4, "-")}
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(codes.map((c) => groupCode(c, 4, "-")).join("\n")).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? "نُسخت ✓" : "نسخ الرموز"}
        </button>
        <div role="note" className="callout callout-warning">
          <IconWarning />
          <span>لن تظهر هذه الرموز مرة أخرى، ولا نخزّنها إلا بصيغة مشفّرة لا يمكن استرجاعها.</span>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => router.replace("/admin/clients")}>
          حفظتها، افتح لوحة الإدارة
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="admin-login-box">
        <div className="admin-login-head">
          <h1>اكتمل الإعداد</h1>
          <p>دخول المدير مُعدّ بالفعل، ولا يمكن تشغيل الإعداد مرة أخرى.</p>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => router.replace("/admin/clients")}>
          افتح لوحة الإدارة
        </button>
      </div>
    );
  }

  return (
    <div className="admin-login-box">
      <div className="admin-login-head">
        <div className="admin-login-icon">
          <IconPasskey />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1>إعداد دخول المدير</h1>
          <p>سجّل مفتاحَي Passkey على جهازين مختلفين (مثل هاتفك وحاسوبك)، حتى لا تفقد الوصول إذا ضاع أحدهما.</p>
        </div>
      </div>
      {error && (
        <div role="alert" className="callout callout-danger">
          {error}
        </div>
      )}
      {!verified && (
        <label className="field">
          <span className="field-label">رمز الإعداد</span>
          <input
            className="input mono"
            dir="ltr"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
          />
          <span className="field-hint">الرمز المحفوظ في إعدادات الخادم السرية. يعمل مرة واحدة فقط لإعداد الدخول.</span>
        </label>
      )}
      <ol className="setup-steps">
        <li data-done={count >= 1 || undefined}>المفتاح الأول {count >= 1 ? "✓" : ""}</li>
        <li data-done={count >= 2 || undefined}>المفتاح الثاني {count >= 2 ? "✓" : ""}</li>
        <li>رموز الاسترداد</li>
      </ol>
      {count < 2 ? (
        <button type="button" className="btn btn-primary btn-lg" onClick={register} disabled={busy || !token} style={{ fontSize: 17 }}>
          {busy && <span className="spinner" aria-hidden />}
          {count === 0 ? "تسجيل المفتاح الأول" : "تسجيل المفتاح الثاني"}
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-lg" onClick={finish} disabled={busy || !token} style={{ fontSize: 17 }}>
          {busy && <span className="spinner" aria-hidden />}
          إكمال الإعداد وإظهار رموز الاسترداد
        </button>
      )}
    </div>
  );
}
