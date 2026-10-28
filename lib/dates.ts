// Dates are shown in Arabic with Latin digits, in Asia/Damascus.
export const APP_TIMEZONE = "Asia/Damascus";
const LOCALE = "ar-SY-u-nu-latn";

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayMonthFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", timeZone: APP_TIMEZONE });
const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: APP_TIMEZONE,
});
const isoDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE });

/** A calendar date (YYYY-MM-DD, already a Damascus business date) → «21 تشرين الثاني 2026». */
export function formatDate(isoDate: string): string {
  return dateFmt.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

/** Today's date in Damascus as YYYY-MM-DD. */
export function damascusToday(now = new Date()): string {
  return isoDayFmt.format(now);
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** A timestamp → «27 تشرين الأول، 14:20» / «اليوم، 09:12» / «أمس، 18:22». */
export function formatDateTime(ts: string | Date, now = new Date()): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const day = damascusToday(d);
  const today = damascusToday(now);
  const time = timeFmt.format(d);
  if (day === today) return `اليوم، ${time}`;
  if (day === addDays(today, -1)) return `أمس، ${time}`;
  if (day.slice(0, 4) !== today.slice(0, 4)) return `${formatDate(day)}، ${time}`;
  return `${dayMonthFmt.format(d)}، ${time}`;
}
