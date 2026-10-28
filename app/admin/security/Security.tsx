"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconPasskey } from "@/components/ui/icons";
import { registerExtraPasskey } from "@/components/admin/webauthn";

export function Security({ viaRecovery, codesLeft }: { viaRecovery: boolean; codesLeft: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const add = async () => {
    setBusy(true);
    setError(false);
    const ok = await registerExtraPasskey();
    setBusy(false);
    if (ok) router.replace("/admin/clients");
    else setError(true);
  };
  return (
    <div className="admin-login-box">
      <div className="admin-login-head">
        <div className="admin-login-icon">
          <IconPasskey />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1>{viaRecovery ? "سجّل Passkey جديدًا" : "إضافة Passkey"}</h1>
          <p>
            {viaRecovery
              ? "دخلت برمز استرداد. سجّل مفتاحًا جديدًا على هذا الجهاز قبل متابعة العمل."
              : "أضف مفتاحًا على جهاز آخر لتبقى قادرًا على الدخول."}{" "}
            تبقّى لديك {codesLeft} من رموز الاسترداد.
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="callout callout-danger">
          لم يكتمل تسجيل المفتاح. حاول مرة أخرى.
        </div>
      )}
      <button type="button" className="btn btn-primary btn-lg" onClick={add} disabled={busy} style={{ fontSize: 17 }}>
        {busy && <span className="spinner" aria-hidden />}
        تسجيل Passkey على هذا الجهاز
      </button>
    </div>
  );
}
