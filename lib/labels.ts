import type { AuditEntry, BotState, ClientRow, SubSummary } from "@/server/admin/types";
import { formatDate, formatDateTime } from "./dates";

export type Tone = "green" | "amber" | "red" | "gray";

export function clientsCountLabel(n: number): string {
  if (n === 0) return "لا يوجد عملاء";
  if (n === 1) return "عميل واحد";
  if (n === 2) return "عميلان";
  if (n <= 10) return `${n} عملاء`;
  return `${n} عميلًا`;
}

export function daysLabel(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}

export type Bucket = "active" | "soon" | "expired" | "paused";

/** Days after today until the last day (0 = ends today). */
export const daysToEnd = (s: SubSummary) => (s.days_left ?? 0) - 1;

export function bucket(s: SubSummary): Bucket {
  if (s.state === "paused") return "paused";
  if (s.state !== "active") return "expired";
  return daysToEnd(s) <= 7 ? "soon" : "active";
}

export function subChip(s: SubSummary): { label: string; tone: Tone; meta: string } {
  const b = bucket(s);
  const end = s.ends_on ? formatDate(s.ends_on) : "";
  const d = daysToEnd(s);
  switch (b) {
    case "active":
      return { label: "نشط", tone: "green", meta: `حتى ${end}` };
    case "soon":
      return {
        label: d === 0 ? "ينتهي اليوم" : d === 1 ? "ينتهي غدًا" : d === 2 ? "ينتهي خلال يومين" : `ينتهي خلال ${d} أيام`,
        tone: "amber",
        meta: end,
      };
    case "paused":
      return { label: "موقوف إداريًا", tone: "gray", meta: `حتى ${end}` };
    default:
      return { label: "منتهٍ", tone: "red", meta: s.ends_on ? `انتهى ${end}` : "بلا اشتراك" };
  }
}

export function igCell(ig: ClientRow["ig"]): { label: string; tone: "soft" | Tone; dot: string; ltr: boolean } {
  if (ig.status === "ok") return { label: `@${ig.username ?? ""}`, tone: "soft", dot: "var(--success)", ltr: true };
  if (ig.status === "needs_reconnect") return { label: "يحتاج إعادة ربط", tone: "red", dot: "var(--danger)", ltr: false };
  return { label: "غير مربوط", tone: "gray", dot: "var(--border-hover)", ltr: false };
}

/** Short label for the clients table. */
export function botListLabel(b: BotState): { label: string; tone: "soft" | Tone } {
  switch (b) {
    case "run":
      return { label: "يعمل", tone: "soft" };
    case "paused":
      return { label: "أوقفه العميل", tone: "gray" };
    case "wait":
      return { label: "بانتظار الربط", tone: "gray" };
    case "err":
      return { label: "متوقف: خلل في الربط", tone: "red" };
    case "sub_expired":
      return { label: "متوقف: الاشتراك منتهٍ", tone: "red" };
    default:
      return { label: "متوقف: إيقاف إداري", tone: "gray" };
  }
}

/** Reason on the client detail page (first failing check). */
export function botReason(b: BotState): string {
  switch (b) {
    case "run":
      return "يعمل";
    case "disabled":
      return "متوقف: الحساب معطّل";
    case "sub_paused":
      return "متوقف: إيقاف إداري للاشتراك";
    case "sub_expired":
      return "متوقف: الاشتراك منتهٍ";
    case "admin":
      return "متوقف: أوقفتَه إداريًا";
    case "err":
      return "متوقف: خلل في ربط إنستغرام";
    case "wait":
      return "متوقف: بانتظار ربط إنستغرام";
    case "paused":
      return "متوقف: أوقفه العميل";
  }
}

const ACTOR: Record<AuditEntry["actor_type"], string> = { admin: "المدير", system: "النظام", client: "العميل" };

export function auditText(e: AuditEntry): { text: string; tone: Tone } {
  const note = typeof e.details?.note === "string" && e.details.note ? ` · «${e.details.note}»` : "";
  switch (e.action) {
    case "account.created":
      return { text: "أُنشئ الحساب", tone: "gray" };
    case "code.generated":
      return { text: "وُلّد رمز الدخول", tone: "gray" };
    case "subscription.renewed":
      return { text: `جُدّد الاشتراك 30 يومًا${note}`, tone: "green" };
    case "subscription.paused":
      return { text: "أُوقف الاشتراك مؤقتًا", tone: "gray" };
    case "subscription.resumed":
      return { text: "استُؤنف الاشتراك", tone: "green" };
    case "subscription.ended":
      return { text: "أُنهي الاشتراك وتوقفت الأتمتة", tone: "red" };
    case "code.regenerated":
      return { text: "وُلّد رمز جديد وأُبطل القديم وأُنهيت الجلسات", tone: "amber" };
    case "code.revoked":
      return { text: "أُبطل رمز الدخول وأُنهيت الجلسات", tone: "red" };
    case "code.sessions_ended":
      return { text: "أُنهيت كل جلسات العميل", tone: "amber" };
    case "account.disabled":
      return { text: "عُطّل الحساب وأُنهيت الجلسات", tone: "red" };
    case "account.enabled":
      return { text: "أُعيد تفعيل الحساب", tone: "green" };
    case "automation.allowed":
      return { text: "سُمح بالأتمتة", tone: "green" };
    case "automation.blocked":
      return { text: "أُوقفت الأتمتة إداريًا", tone: "red" };
    default:
      return { text: e.action, tone: "gray" };
  }
}

export const auditMeta = (e: AuditEntry) => `${ACTOR[e.actor_type]} · ${formatDateTime(e.created_at)}`;

export function sessionsLabel(n: number): string {
  if (n === 0) return "لا توجد";
  if (n === 1) return "جلسة واحدة";
  if (n === 2) return "جلستان";
  if (n <= 10) return `${n} جلسات`;
  return `${n} جلسة`;
}
