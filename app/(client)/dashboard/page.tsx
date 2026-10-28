import type { Metadata } from "next";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MiniRobot } from "@/components/robot/MiniRobot";
import { formatDate } from "@/lib/dates";
import type { SubSummary } from "@/server/admin/types";
import { requireClient } from "@/server/auth/client";
import { getDb } from "@/server/db";
import { env } from "@/server/env";
import { logoutAction } from "../actions";
import { Expired } from "./Expired";

export const metadata: Metadata = { title: "لوحتك — KHATIB" };

type Me = {
  id: string;
  public_id: string;
  name: string;
  subscription: SubSummary;
  ig: { status: "ok" | "needs_reconnect" | "none"; username: string | null } | null;
};

// Phase 2: a minimal home. The full dashboard (Phase 3) builds on this page.
export default async function Dashboard() {
  const clientId = await requireClient();
  const db = await getDb();
  // Runs with the client's own JWT: Postgres RLS limits it to this tenant.
  const me = await db.asClient<Me>(clientId, "client_me");
  const sub = me.subscription;

  if (sub.state === "expired" || sub.state === "none") {
    return <Expired endsOn={sub.ends_on ?? sub.today} whatsapp={env().SUPPORT_WHATSAPP_URL} />;
  }

  const ig = me.ig?.status ?? "none";
  const headline =
    sub.state === "paused"
      ? "اشتراكك موقوف مؤقتًا من فريق KHATIB، والبوت متوقف حتى الاستئناف."
      : ig === "ok"
        ? "كل شيء يعمل. البوت يرد على التعليقات نيابةً عنك."
        : ig === "needs_reconnect"
          ? "يحتاج حساب إنستغرام إلى إعادة الربط ليعود البوت للعمل."
          : "خطوة واحدة متبقية: اربط حساب إنستغرام ليبدأ البوت بالعمل.";

  return (
    <div>
      <header className="client-top">
        <Brand />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ThemeToggle />
          <form action={logoutAction}>
            <button type="submit" className="btn" style={{ minHeight: 38, height: 38, padding: "0 14px", borderRadius: 10, fontSize: 14 }}>
              خروج
            </button>
          </form>
        </div>
      </header>
      <main className="client-main">
        <section className="client-hero">
          <MiniRobot width={190} />
          <div className="led-bubble" role="status">
            <p>أهلًا، {me.name}</p>
            <p style={{ fontSize: 15, fontWeight: 400, color: "var(--text-2)", textShadow: "none", marginTop: 4 }}>{headline}</p>
          </div>
        </section>
        <section className="tiles" aria-label="الحالة">
          <div className="card">
            <h2>الاشتراك</h2>
            <span className="big">{sub.days_left}</span>
            <span className="meta">
              {sub.state === "paused" ? "موقوف مؤقتًا · " : "يومًا متبقيًا · "}حتى {sub.ends_on ? formatDate(sub.ends_on) : ""}
            </span>
          </div>
          <div className="card">
            <h2>إنستغرام</h2>
            <span className={`chip ${ig === "ok" ? "tone-green" : ig === "needs_reconnect" ? "tone-red" : "tone-gray"}`} style={{ alignSelf: "flex-start" }}>
              {ig === "ok" ? "مربوط" : ig === "needs_reconnect" ? "يحتاج إعادة ربط" : "غير مربوط"}
            </span>
            {me.ig?.username && (
              <span className="meta" dir="ltr" style={{ textAlign: "right" }}>
                @{me.ig.username}
              </span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
