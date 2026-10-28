export type Post = {
  id: string;
  caption: string;
  media_type: string | null;
  posted_at: string | null;
  comments_count: number;
  replied: number;
};

const TONES = ["#2a2622", "#232733", "#2b2420", "#1f2a26", "#2a2226", "#20262b"];

/** Stable placeholder tile colour per post (thumbnails arrive with Phase 4). */
export function postTone(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}

export function postKind(t: string | null): string {
  if (t === "VIDEO" || t === "REELS") return "ريلز";
  if (t === "CAROUSEL_ALBUM") return "متعدد";
  return "صورة";
}

export function rulesCountLabel(n: number, special = true): string {
  if (n === 0) return special ? "بلا قواعد خاصة" : "بلا قواعد";
  if (n === 1) return special ? "قاعدة خاصة" : "قاعدة واحدة";
  if (n === 2) return special ? "قاعدتان خاصتان" : "قاعدتان";
  return special ? `${n} قواعد خاصة` : `${n} قواعد`;
}
