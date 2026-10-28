import type { Metadata } from "next";
import Link from "next/link";
import { BotSwitch } from "@/components/client/BotSwitch";
import { ClientShell } from "@/components/client/ClientShell";
import { MiniRobot } from "@/components/robot/MiniRobot";
import { IconLock } from "@/components/ui/icons";
import { formatDate, formatDateTime, formatDayMonth } from "@/lib/dates";
import { commentsLabel, eventView, type ClientEvent } from "@/lib/events";
import { getClientContext } from "@/server/client/context";
import { env, metaConfigured } from "@/server/env";
import { Expired } from "./Expired";

export const metadata: Metadata = { title: "لوحتك — KHATIB" };

type Dash = {
  global_stop: boolean;
  can_edit: boolean;
  replies_today: number;
  rules: { id: string; keywords: string[]; public_reply: string; dm_text: string; link_url: string; today: number }[];
  events: ClientEvent[];
};

const DOT = { green: "var(--success)", amber: "var(--warning)", gray: "var(--muted-2)", soft: "var(--muted-2)" };

const IG_RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "رُبط حساب إنستغرام بنجاح. البوت جاهز للعمل." },
  denied: { ok: false, text: "أُلغي الربط من صفحة Meta، فلم يتغيّر شيء. يمكنك المحاولة متى شئت." },
  state: { ok: false, text: "انتهت مهلة طلب الربط. ابدأ الربط من جديد من هذه الصفحة." },
  in_use: { ok: false, text: "حساب إنستغرام هذا مربوط بلوحة أخرى. تواصل مع فريق KHATIB." },
  failed: { ok: false, text: "تعذّر إكمال الربط مع Meta. تأكد أن الحساب احترافي (أعمال أو صانع محتوى) وحاول مرة أخرى." },
  not_configured: { ok: false, text: "الربط غير متاح حاليًا." },
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ig?: string }> }) {
  const { clientId, db, me } = await getClientContext();
  const metaReady = metaConfigured();
  const igResult = IG_RESULT[(await searchParams).ig ?? ""];
  const sub = me.subscription;
  if (sub.state === "expired" || sub.state === "none") {
    return <Expired endsOn={sub.ends_on ?? sub.today} whatsapp={env().SUPPORT_WHATSAPP_URL} />;
  }
  const d = await db.asClient<Dash>(clientId, "client_dashboard");

  const ig = me.ig?.status ?? "none";
  const clientOn = me.bot?.client_enabled ?? false;
  const paused = sub.state === "paused";
  const needsConnect = ig !== "ok";
  const running = !paused && !d.global_stop && ig === "ok" && clientOn;

  const headline = d.global_stop
    ? "أنا متوقف مؤقتًا من فريق KHATIB، وسأعود للعمل فور انتهاء الصيانة."
    : paused
      ? "اشتراكك موقوف مؤقتًا من فريق KHATIB، وأنا متوقف حتى الاستئناف."
      : ig === "none"
        ? "خطوة واحدة باقية: اربط حساب إنستغرام لأبدأ العمل."
        : ig === "needs_reconnect"
          ? "توقفتُ مؤقتًا لأن ربط إنستغرام انتهت صلاحيته. أعد الربط وسأكمل فورًا."
          : !clientOn
            ? "أنا متوقف الآن بطلبك. شغّلني متى شئت."
            : d.replies_today > 0
              ? `كل شيء يعمل. رددتُ اليوم على ${commentsLabel(d.replies_today)}.`
              : "كل شيء يعمل. سأرد على التعليقات فور وصولها.";

  const botLabel = running ? "يعمل" : ig !== "ok" ? "بانتظار الربط" : "متوقف";
  const botMeta = running
    ? "المفتاح يوقفه فورًا"
    : ig !== "ok"
      ? "يعمل تلقائيًا بعد الربط"
      : d.global_stop
        ? "متوقف مؤقتًا من فريق KHATIB"
        : paused
          ? "الاشتراك موقوف مؤقتًا"
          : "لن يرد على أي تعليق أو رسالة";

  return (
    <ClientShell>
      <section className="hero">
        <MiniRobot width={190} pose={needsConnect || d.global_stop ? "point" : "wink"} />
        <div className="hero-bubble" role="status">
          <svg className="tail" width="20" height="30" viewBox="0 0 20 30" aria-hidden>
            <path d="M0 0 C6 6 12 11 19 15 C12 19 6 24 0 30 Z" strokeWidth="1" />
            <rect x="-2" y="0.6" width="4.6" height="28.8" />
          </svg>
          <p className="hero-hello">أهلًا، {me.name}</p>
          <p className="hero-line">{headline}</p>
        </div>
      </section>

      {igResult && (
        <div role={igResult.ok ? "status" : "alert"} className={`callout ${igResult.ok ? "callout-success" : "callout-danger"}`}>
          {igResult.text}
        </div>
      )}

      {needsConnect && (
        <section aria-labelledby="connect-h" className="card" style={{ gap: 22, padding: 28, borderRadius: 24, borderColor: "var(--border-strong)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 id="connect-h" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
              {ig === "needs_reconnect" ? "أعد ربط حساب إنستغرام" : "اربط حساب إنستغرام"}
            </h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "var(--muted)" }}>
              {ig === "needs_reconnect"
                ? "Meta تطلب تجديد الموافقة من وقت لآخر، أو بعد تغيير كلمة المرور. ردودك وإعداداتك محفوظة كما هي."
                : "البوت يحتاج إذنك ليقرأ التعليقات والرسائل ويرد عليها نيابة عنك. يتم الربط عبر Meta مباشرة."}
            </p>
          </div>
          <ol className="steps">
            <li>
              <span className="step-num">1</span>تأكد أن حسابك على إنستغرام احترافي (أعمال أو صانع محتوى).
            </li>
            <li>
              <span className="step-num">2</span>اضغط «ربط»، وستنتقل إلى صفحة Meta الرسمية لتسجيل الدخول.
            </li>
            <li>
              <span className="step-num">3</span>وافق على صلاحيات التعليقات والرسائل، ثم تعود إلى هنا تلقائيًا.
            </li>
          </ol>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {metaReady && d.can_edit ? (
              <a href="/connect/instagram" className="btn btn-primary" style={{ minHeight: 52, padding: "0 24px", borderRadius: 14, fontSize: 16, textDecoration: "none" }}>
                {ig === "needs_reconnect" ? "إعادة الربط" : "ربط حساب إنستغرام"}
              </a>
            ) : (
              <button type="button" className="btn btn-primary" disabled style={{ minHeight: 52, padding: "0 24px", borderRadius: 14, fontSize: 16 }}>
                {ig === "needs_reconnect" ? "إعادة الربط" : "ربط حساب إنستغرام"}
              </button>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--muted-2)" }}>
              <IconLock />
              لن نطلب منك كلمة مرور إنستغرام أبدًا.
            </span>
          </div>
          {!metaReady && <span className="field-hint">سيتاح الربط قريبًا بعد اعتماد تطبيق KHATIB لدى Meta.</span>}
        </section>
      )}

      <section aria-label="الحالة" className="tiles">
        <div className="card">
          <span className="card-label">الاشتراك</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="big">{sub.days_left}</span>
            <span style={{ fontSize: 16, color: "var(--text-2)" }}>{paused ? "يومًا · موقوف مؤقتًا" : "يومًا متبقيًا"}</span>
          </span>
          <span className="meta">ينتهي في {sub.ends_on ? formatDate(sub.ends_on) : ""}. للتجديد تواصل معنا.</span>
        </div>
        <div className="card">
          <span className="card-label">إنستغرام</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, fontWeight: 600 }}>
            <span className="dot" style={{ width: 9, height: 9, background: ig === "ok" ? "var(--success)" : ig === "needs_reconnect" ? "var(--danger)" : "var(--border-hover)" }} />
            <span dir={me.ig?.username ? "ltr" : "rtl"}>{me.ig?.username ? `@${me.ig.username}` : "غير مربوط"}</span>
          </span>
          <span className="meta">
            {ig === "ok" ? (me.ig?.updated_at ? `مربوط منذ ${formatDayMonth(me.ig.updated_at)}` : "مربوط") : ig === "needs_reconnect" ? "انتهت صلاحية الربط" : "لم يُربط بعد"}
          </span>
        </div>
        <div className="card">
          <div className="card-title-row">
            <span className="card-label">البوت</span>
            <BotSwitch on={clientOn} disabled={ig !== "ok" || !d.can_edit} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, color: running ? "var(--success)" : ig !== "ok" ? "var(--muted-2)" : "var(--text-2)" }}>
            {botLabel}
          </span>
          <span className="meta">{botMeta}</span>
        </div>
      </section>

      {(d.rules.length > 0 || d.events.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 12, alignItems: "start" }}>
          <section aria-labelledby="today-h" className="card" style={{ gap: 18, padding: 24 }}>
            <div className="card-title-row">
              <h2 id="today-h">الكلمات المفعّلة</h2>
              <Link href="/posts">إدارة الردود</Link>
            </div>
            {d.rules.length === 0 ? (
              <span className="meta">لا توجد قواعد مفعّلة بعد.</span>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {d.rules.slice(0, 6).map((r) => {
                  const parts = [r.public_reply ? "رد على التعليق" : null, r.dm_text ? "رسالة خاصة" : null, r.link_url ? "رابط" : null].filter(Boolean);
                  return (
                    <li key={r.id} className="rule-mini">
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {r.keywords.map((w) => (
                            <span key={w} className="word-chip">
                              {w}
                            </span>
                          ))}
                        </span>
                        <span className="meta">{parts.join(" + ")}</span>
                      </div>
                      <span className="mono" style={{ flex: "none", fontSize: 15, color: "var(--text-2)" }}>
                        {r.today}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <span className="meta">الرقم = عدد المرات التي استُخدمت فيها القاعدة اليوم.</span>
          </section>

          <section aria-labelledby="ev-h" className="card" style={{ gap: 14, padding: 24 }}>
            <div className="card-title-row">
              <h2 id="ev-h">آخر الأحداث</h2>
              <Link href="/activity">السجل الكامل</Link>
            </div>
            {d.events.length === 0 ? (
              <span className="meta">لا أحداث بعد.</span>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
                {d.events.map((e, i) => {
                  const v = eventView(e);
                  return (
                    <li key={i} className="event-mini">
                      <span className="dot" style={{ marginTop: 7, background: DOT[v.tone] }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 14, lineHeight: 1.6 }}>{v.text}</span>
                        <span style={{ fontSize: 12, color: "var(--muted-2)" }}>{formatDateTime(e.created_at)}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}
    </ClientShell>
  );
}
