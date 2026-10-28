// Keyword normalisation — mirrors app_private.norm_keyword() in SQL
// (tests assert they agree). Matching is a substring test on normalised text.

const TASHKEEL = /[ً-ٰٟ]/g;

export function normalizeKeyword(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(TASHKEEL, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/** Does a comment contain the keyword (after normalising both)? */
export function commentMatches(comment: string, keyword: string): boolean {
  const k = normalizeKeyword(keyword);
  return k.length > 0 && normalizeKeyword(comment).includes(k);
}

export const KEYWORD_SEPARATORS = ["Enter", ",", "،"];
export const DM_MAX = 1000;
export const REPLY_MAX = 1000;

export function isValidLink(url: string): boolean {
  return url.length <= 500 && /^https:\/\/[^\s/.]+\.[^\s]+$/.test(url);
}
