import { describe, expect, it } from "vitest";
import {
  ACCESS_CODE_ALPHABET,
  generateAccessCode,
  generateRecoveryCode,
  groupCode,
  hmac,
  normalizeAccessCode,
  normalizeRecoveryCode,
  randomString,
  timingSafeEqualStr,
  toByteaHex,
} from "@/lib/codes";

describe("access codes", () => {
  it("12 chars from a 55-char alphabet without look-alikes (~69 bits)", () => {
    expect(ACCESS_CODE_ALPHABET).toHaveLength(55);
    for (const ch of "0O1Il") expect(ACCESS_CODE_ALPHABET).not.toContain(ch);
    expect(12 * Math.log2(55)).toBeGreaterThan(69);
    for (let i = 0; i < 200; i++) {
      const c = generateAccessCode();
      expect(c).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{12}$/);
    }
  });

  it("is unbiased (every symbol roughly equally likely)", () => {
    const counts = new Map<string, number>();
    const s = randomString(ACCESS_CODE_ALPHABET, 55_000);
    for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(55);
    for (const n of counts.values()) expect(Math.abs(n - 1000)).toBeLessThan(200);
  });

  it("strips whitespace but keeps case", () => {
    expect(normalizeAccessCode(" K7Q2 m9XP\t4T ")).toBe("K7Q2m9XP4T");
  });

  it("recovery codes: 12 upper-case chars, accept separators and lower case", () => {
    const c = generateRecoveryCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    expect(normalizeRecoveryCode(groupCode(c, 4, "-").toLowerCase())).toBe(c);
  });

  it("groups 4-4-4", () => {
    expect(groupCode("ABCDEFGHJKLM")).toBe("ABCD EFGH JKLM");
  });
});

describe("hashing", () => {
  it("HMAC-SHA256 is deterministic and keyed", async () => {
    const a = await hmac("pepper-1", "code");
    expect(a).toHaveLength(32);
    expect(toByteaHex(a)).toBe(toByteaHex(await hmac("pepper-1", "code")));
    expect(toByteaHex(a)).not.toBe(toByteaHex(await hmac("pepper-2", "code")));
    expect(toByteaHex(a)).toMatch(/^\\x[0-9a-f]{64}$/);
  });

  it("timing-safe comparison", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
  });
});
