// AES-256-GCM for Instagram tokens at rest. The key is TOKEN_ENCRYPTION_KEY
// (32 random bytes, base64). The client id is bound as additional data, so a
// ciphertext copied to another tenant's row does not decrypt.

const keys = new Map<string, Promise<CryptoKey>>();

function importKey(b64: string): Promise<CryptoKey> {
  let k = keys.get(b64);
  if (!k) {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (raw.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)");
    k = crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    keys.set(b64, k);
  }
  return k;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const toBytea = (u: Uint8Array) => "\\x" + Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");

export async function encryptToken(keyB64: string, clientId: string, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(clientId) },
    await importKey(keyB64),
    new TextEncoder().encode(token),
  );
  return { ciphertext: new Uint8Array(ct), iv };
}

/** Inputs as base64 (how the database functions return bytea). */
export async function decryptToken(keyB64: string, clientId: string, ciphertextB64: string, ivB64: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(ivB64), additionalData: new TextEncoder().encode(clientId) },
    await importKey(keyB64),
    unb64(ciphertextB64),
  );
  return new TextDecoder().decode(pt);
}

export { b64 as toBase64 };
