import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import { formatDate } from "@/lib/dates";
import { daysLabel } from "@/lib/labels";
import { currentSessionHash, getClientContext } from "@/server/client/context";
import { env } from "@/server/env";
import { DevicesSection, InstagramSection, type Device } from "./SettingsView";

export const metadata: Metadata = { title: "الحساب — KHATIB" };

export default async function SettingsPage() {
  const { db, me } = await getClientContext();
  const devices = await db.service<Device[]>("client_devices", { p_session_hash: await currentSessionHash() });
  const sub = me.subscription;
  const state =
    sub.state === "active"
      ? { label: "نشط", color: "var(--success)" }
      : sub.state === "paused"
        ? { label: "موقوف مؤقتًا", color: "var(--muted-2)" }
        : { label: "منتهٍ", color: "var(--danger)" };
  return (
    <ClientShell narrow>
      <div className="page-title">
        <h1>الحساب</h1>
        <p>
          {me.name} ·{" "}
          <span dir="ltr" className="mono">
            {me.public_id}
          </span>
        </p>
      </div>

      <section className="card" style={{ padding: 24, borderRadius: 20, gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>الاشتراك</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <div className="kv-col">
            <span>الحالة</span>
            <span style={{ color: state.color, fontWeight: 600 }}>{state.label}</span>
          </div>
          <div className="kv-col">
            <span>{sub.state === "expired" ? "انتهى في" : "ينتهي في"}</span>
            <span>{sub.ends_on ? formatDate(sub.ends_on) : "—"}</span>
          </div>
          <div className="kv-col">
            <span>المتبقي</span>
            <span>{sub.state === "expired" || sub.state === "none" ? "—" : daysLabel(sub.days_left ?? 0)}</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
          للتجديد تواصل مع فريق KHATIB. يُضاف التجديد بعد تاريخ الانتهاء، فلا تخسر أي يوم.
        </p>
        <a href={env().SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn" style={{ alignSelf: "flex-start", textDecoration: "none" }}>
          تواصل عبر واتساب
        </a>
      </section>

      <section className="card" style={{ padding: 24, borderRadius: 20, gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>حساب إنستغرام</h2>
        <InstagramSection status={me.ig?.status ?? "none"} username={me.ig?.username ?? null} />
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--muted-2)" }}>
          نستخدم إذن Meta الرسمي فقط، ولا نعرف كلمة مرور إنستغرام. يمكنك أيضًا إلغاء الإذن من إعدادات إنستغرام نفسها.
        </p>
      </section>

      <section className="card" style={{ padding: 24, borderRadius: 20, gap: 16 }}>
        <DevicesSection devices={devices} />
        <div className="callout callout-warning" style={{ padding: "14px 16px", borderRadius: 14 }}>
          ترى جهازًا لا تعرفه؟ أنهِ جلسته، ثم تواصل معنا لتغيير رمز الدخول. لا يمكن تغيير الرمز من هنا حفاظًا على أمانك.
        </div>
      </section>
    </ClientShell>
  );
}
