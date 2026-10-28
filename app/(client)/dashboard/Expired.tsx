import { Brand } from "@/components/Brand";
import { SleepingRobot } from "@/components/SleepingRobot";
import { addDays, formatDate } from "@/lib/dates";
import { logoutAction } from "../actions";

// designs/Client Expired.dc.html — stays dark in both themes.
export function Expired({ endsOn, whatsapp }: { endsOn: string; whatsapp: string }) {
  return (
    <div className="force-dark expired-page">
      <div className="expired-glow" aria-hidden />
      <header className="login-header">
        <Brand />
        <form action={logoutAction}>
          <button type="submit" className="btn expired-logout">
            خروج
          </button>
        </form>
      </header>
      <main className="expired-main">
        <div className="expired-box">
          <SleepingRobot />
          <div className="expired-text">
            <h1>انتهى اشتراكك، والبوت في استراحة</h1>
            <p>
              انتهى الاشتراك في <span style={{ color: "#f2f2f0" }}>{formatDate(endsOn)}</span>، فتوقفت الردود التلقائية والرسائل
              الخاصة. ردودك وكلماتك محفوظة حتى {formatDate(addDays(endsOn, 180))}، وتعود للعمل فور التجديد. بعد التجديد ستحتاج
              إلى إعادة ربط إنستغرام فقط.
            </p>
          </div>
          <div className="expired-card">
            <span style={{ fontSize: 15, fontWeight: 600 }}>للتجديد</span>
            <ol>
              <li>
                <span className="mono">1</span>تواصل معنا وادفع قيمة الشهر الجديد.
              </li>
              <li>
                <span className="mono">2</span>نفعّل التجديد من جهتنا، وتعود لوحتك والبوت للعمل فورًا بنفس رمز الدخول.
              </li>
            </ol>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary expired-wa">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
                </svg>
                تواصل عبر واتساب
              </a>
            </div>
          </div>
          <p className="expired-note">يمكنك الاطلاع على إعداداتك، لكن لا يمكن تشغيل البوت قبل التجديد.</p>
        </div>
      </main>
    </div>
  );
}
