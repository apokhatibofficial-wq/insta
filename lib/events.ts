import { formatDate } from "./dates";

export type ClientEvent = {
  kind: "reply" | "skip" | "fail" | "set" | "sys";
  code: string | null;
  data: Record<string, unknown>;
  summary: string | null;
  created_at: string;
};

export type EventView = { text: string; fix?: string; tone: "green" | "gray" | "amber" | "soft" };

const words = (d: Record<string, unknown>) =>
  Array.isArray(d.keywords) && d.keywords.length ? `«${(d.keywords as string[]).join("»، «")}»` : "";

const hoursLabel = (h: unknown) => (h === 1 ? "ساعة" : h === 6 ? "6 ساعات" : "24 ساعة");

const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatDate(v) : "");

/** Plain-language text for a client event (wording lives here, not in the DB). */
export function eventView(e: ClientEvent): EventView {
  const d = e.data ?? {};
  switch (e.code) {
    case "rule.created":
      return { text: `أضفتَ قاعدة جديدة ${words(d)}`.trim(), tone: "soft" };
    case "rule.updated":
      return { text: `عدّلتَ قاعدة ${words(d)}`.trim(), tone: "soft" };
    case "rule.deleted":
      return { text: `حذفتَ قاعدة ${words(d)}`.trim(), tone: "soft" };
    case "bot.on":
      return { text: "شغّلتَ البوت", tone: "soft" };
    case "bot.off":
      return { text: "أوقفتَ البوت", tone: "soft" };
    case "cooldown.changed":
      return { text: `صار منع التكرار: ردّ واحد لكل شخص كل ${hoursLabel(d.hours)}`, tone: "soft" };
    case "devices.ended":
      return { text: "أنهيتَ جلسات على أجهزة أخرى", tone: "soft" };
    case "ig.disconnected":
      return { text: "فُصل حساب إنستغرام وحُذف إذن الوصول", tone: "soft" };
    case "ig.connected":
      return { text: `رُبط حساب إنستغرام${d.username ? ` @${d.username}` : ""}`, tone: "green" };
    case "ig.reconnect_needed":
      return {
        text: "توقف البوت: رفضت Meta إذن الوصول إلى حسابك",
        fix: "أعد ربط حساب إنستغرام من الصفحة الرئيسية، وسيعود البوت للعمل فورًا. ردودك محفوظة.",
        tone: "amber",
      };
    case "reply.sent": {
      const what = [d.public ? "ردّ على التعليق" : null, d.dm ? (d.link ? "أرسل رسالة خاصة مع الرابط" : "أرسل رسالة خاصة") : null]
        .filter(Boolean)
        .join(" و");
      return {
        text: `${what || "ردّ"}: «${String(d.excerpt ?? "")}»${d.username ? ` من @${d.username}` : ""}`,
        tone: "green",
      };
    }
    case "reply.cooldown":
      return {
        text: `تجاهل تعليقًا من @${String(d.username ?? "")} لأنه تلقّى ردًا خلال آخر ${hoursLabel(d.hours)}`,
        tone: "gray",
      };
    case "reply.dm_failed":
      return {
        text: `تعذّر إرسال رسالة خاصة إلى @${String(d.username ?? "")}`,
        fix: d.public_sent
          ? "اكتفى البوت بالرد العلني. قد تكون الرسائل الخاصة مغلقة عند هذا الشخص، أو مرّ أكثر من 7 أيام على تعليقه."
          : "قد تكون الرسائل الخاصة مغلقة عند هذا الشخص، أو مرّ أكثر من 7 أيام على تعليقه.",
        tone: "amber",
      };
    case "reply.public_failed":
      return {
        text: `تعذّر الرد علنًا على تعليق @${String(d.username ?? "")}`,
        fix: "ربما حُذف التعليق أو أُغلقت التعليقات على المنشور.",
        tone: "amber",
      };
    case "rate.limited":
      return {
        text: "توقف البوت مؤقتًا: وصل إلى الحد الآمن من الردود خلال ساعة",
        fix: "هذا يحمي حسابك من التقييد لدى Meta. سيعود تلقائيًا خلال أقل من ساعة.",
        tone: "amber",
      };
    case "subscription.renewed":
      return { text: `جُدّد اشتراكك حتى ${date(d.ends_on)}`, tone: "green" };
    case "subscription.paused":
      return { text: "أوقف فريق KHATIB اشتراكك مؤقتًا، فتوقف البوت", tone: "amber" };
    case "subscription.resumed":
      return { text: "استُؤنف اشتراكك", tone: "green" };
    case "subscription.ended":
      return { text: "أُنهي اشتراكك وتوقف البوت. بياناتك محفوظة", tone: "amber" };
    case "subscription.expired":
      return {
        text: "انتهى اشتراكك وتوقف البوت، وحُذف إذن إنستغرام",
        fix: d.delete_on ? `ردودك وكلماتك محفوظة حتى ${date(d.delete_on)}. جدّد قبل ذلك لتعود كما هي.` : undefined,
        tone: "amber",
      };
    case "retention.warning":
      return {
        text: `ستُحذف ردودك وبياناتك في ${date(d.delete_on)}`,
        fix: "جدّد اشتراكك قبل هذا التاريخ لتبقى بياناتك محفوظة.",
        tone: "amber",
      };
    case "automation.blocked":
      return { text: "أوقف فريق KHATIB البوت مؤقتًا", tone: "amber" };
    case "automation.allowed":
      return { text: "سمح فريق KHATIB بتشغيل البوت من جديد", tone: "green" };
    default:
      return {
        text: e.summary ?? "",
        fix: typeof d.fix === "string" ? d.fix : undefined,
        tone: e.kind === "reply" ? "green" : e.kind === "fail" ? "amber" : e.kind === "skip" ? "gray" : "soft",
      };
  }
}

export function commentsLabel(n: number): string {
  if (n === 0) return "لا تعليقات";
  if (n === 1) return "تعليق واحد";
  if (n === 2) return "تعليقين";
  if (n <= 10) return `${n} تعليقات`;
  return `${n} تعليقًا`;
}
