"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/dates";
import { disconnectInstagramAction, endDeviceAction } from "../actions";

export type Device = { id: string; ua: string | null; last_seen_at: string; current: boolean };

export function InstagramSection({
  status,
  username,
  canConnect,
}: {
  status: "ok" | "needs_reconnect" | "none";
  username: string | null;
  canConnect: boolean;
}) {
  const router = useRouter();
  const [dlg, setDlg] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setDlg(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const connected = status !== "none";
  return (
    <>
      {connected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 4 }}>
            <span dir="ltr" style={{ fontSize: 16, fontWeight: 600, textAlign: "right" }}>
              {username ? `@${username}` : "حساب إنستغرام"}
            </span>
            <span style={{ fontSize: 13, color: "var(--muted-2)", display: "flex", alignItems: "center", gap: 6 }}>
              <span className="dot" style={{ width: 7, height: 7, background: status === "ok" ? "var(--success)" : "var(--danger)" }} />
              {status === "ok" ? "مربوط" : "انتهت صلاحية الربط"}
            </span>
          </div>
          <button type="button" className="btn btn-danger-outline" onClick={() => setDlg(true)}>
            فصل الحساب
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 15, color: "var(--muted)" }}>لا يوجد حساب مربوط. البوت متوقف.</span>
          {canConnect ? (
            <a href="/connect/instagram" className="btn btn-primary" style={{ textDecoration: "none" }}>
              ربط حساب إنستغرام
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled title="يتاح بعد اعتماد تطبيق Meta">
              ربط حساب إنستغرام
            </button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="callout callout-danger">
          {error}
        </div>
      )}
      {dlg && (
        <div className="overlay">
          <div className="overlay-bg" onClick={() => setDlg(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="uT" className="dialog" style={{ maxWidth: 440, gap: 16 }}>
            <h2 id="uT">فصل حساب إنستغرام؟</h2>
            <p style={{ color: "var(--muted)" }}>يتوقف البوت فورًا ونحذف إذن الوصول. ردودك وكلماتك تبقى محفوظة، ويمكنك الربط من جديد متى شئت.</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-danger-solid"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await disconnectInstagramAction();
                    setDlg(false);
                    if (r.ok) router.refresh();
                    else setError("تعذّر فصل الحساب. حاول مرة أخرى.");
                  })
                }
                style={{ flex: "none", padding: "0 20px" }}
              >
                فصل الحساب
              </button>
              <button type="button" className="btn" onClick={() => setDlg(false)}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DevicesSection({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const end = (id: string | null) =>
    start(async () => {
      const r = await endDeviceAction(id);
      if (r.ok) router.refresh();
    });
  const others = devices.some((d) => !d.current);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>الأجهزة المسجّل دخولها</h2>
        {others && (
          <button type="button" className="btn" disabled={pending} onClick={() => end(null)} style={{ minHeight: 38, height: 38, padding: "0 14px", borderRadius: 10, fontSize: 14 }}>
            إنهاء الجلسات الأخرى
          </button>
        )}
      </div>
      <div className="device-list">
        {devices.map((d) => (
          <div key={d.id} className="device-row" data-testid="device">
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 15 }}>{d.ua || "جهاز غير معروف"}</span>
              <span style={{ fontSize: 13, color: "var(--muted-2)" }}>{d.current ? "نشط الآن" : `آخر نشاط ${formatDateTime(d.last_seen_at)}`}</span>
            </span>
            {d.current ? (
              <span className="chip tone-green" style={{ borderRadius: 8, height: 24 }}>
                هذا الجهاز
              </span>
            ) : (
              <button type="button" className="btn btn-ghost device-end" disabled={pending} onClick={() => end(d.id)}>
                إنهاء
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
