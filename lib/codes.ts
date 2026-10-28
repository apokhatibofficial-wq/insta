// Access codes, recovery codes and session tokens.
// Uses Web Crypto only, so it runs the same on Node and Cloudflare Workers.

/** 55 characters: no 0/O, 1/I/l, o, i — easy to read aloud and type. */
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export const ACCESS_CODE_LENGTH = 12;

/** 32 characters, upper case only (recovery codes are typed rarely, under stress). */
export const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_LENGTH = 12;
export const RECOVERY_CODE_COUNT = 10;

/** Uniform random string via rejection sampling (no modulo bias). */
export function randomString(alphabet: string, length: number): string {
  const n = alphabet.length;
  if (n < 2 || n > 256) throw new Error("alphabet size");
  const limit = 256 - (256 % n);
  let out = "";
  while (out.length < length) {
    const buf = new Uint8Array(Math.min((length - out.length) * 2, 65_536));
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit) out += alphabet[b % n];
      if (out.length === length) break;
    }
  }
  return out;
}

export const generateAccessCode = () => randomString(ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH);
export const generateRecoveryCode = () => randomString(RECOVERY_CODE_ALPHABET, RECOVERY_CODE_LENGTH);

/** What the user typed → canonical access code (whitespace stripped, case kept). */
export function normalizeAccessCode(input: string): string {
  return input.replace(/\s+/g, "");
}

/** Recovery codes are shown as XXXX-XXXX-XXXX; accept any separators / case. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function groupCode(code: string, size = 4, sep = " "): string {
  return (code.match(new RegExp(`.{1,${size}}`, "g")) ?? []).join(sep);
}

export function isPlausibleAccessCode(code: string): boolean {
  return code.length >= 8 && code.length <= 64 && /^[\x21-\x7e]+$/.test(code);
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export function base64url(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    keyCache.set(secret, k);
  }
  return k;
}

/** HMAC-SHA256(secret, message). Deterministic, so it can be looked up by index. */
export async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/** Postgres bytea hex literal, accepted both by PostgREST and node-postgres. */
export function toByteaHex(buf: Uint8Array): string {
  let s = "\\x";
  for (const b of buf) s += b.toString(16).padStart(2, "0");
  return s;
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
