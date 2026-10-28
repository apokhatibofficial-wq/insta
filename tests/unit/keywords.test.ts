import { describe, expect, it } from "vitest";
import { commentMatches, isValidLink, normalizeKeyword } from "@/lib/keywords";

export const SAMPLES: [string, string][] = [
  ["سِعْر", "سعر"],
  ["أسعار", "اسعار"],
  ["إهداء", "اهداء"],
  ["آخر", "اخر"],
  ["هدى", "هدي"],
  ["قهوة", "قهوه"],
  ["  OUD ", "oud"],
  ["السّعرُ", "السعر"],
  ["ٰعلى", "علي"],
];

describe("keyword normalisation (README spec)", () => {
  it.each(SAMPLES)("%s → %s", (input, out) => {
    expect(normalizeKeyword(input)).toBe(out);
  });

  it("matches substrings after normalising both sides", () => {
    expect(commentMatches("بكم السعر؟", "سعر")).toBe(true);
    expect(commentMatches("سعرها كم", "سِعر")).toBe(true);
    expect(commentMatches("Oud please", "oud")).toBe(true);
    expect(commentMatches("مرحبا", "سعر")).toBe(false);
    expect(commentMatches("أي شيء", "  ")).toBe(false);
  });
});

describe("product links", () => {
  it("must be https with a host", () => {
    expect(isValidLink("https://shop.example.com/oud")).toBe(true);
    expect(isValidLink("http://shop.example.com")).toBe(false);
    expect(isValidLink("https://localhost")).toBe(false);
    expect(isValidLink("javascript:alert(1)")).toBe(false);
    expect(isValidLink("https://a.b c")).toBe(false);
  });
});
