import { importJWK, SignJWT, type JWK } from "jose";

// Client JWTs for Supabase RLS, signed with our own ES256 key that is imported
// into the project's "JWT signing keys" (Supabase verifies it via JWKS by `kid`).
export const CLIENT_JWT_TTL_S = 300;

const keyCache = new Map<string, Promise<{ key: CryptoKey | Uint8Array; kid: string }>>();

function loadKey(jwkJson: string) {
  let p = keyCache.get(jwkJson);
  if (!p) {
    p = (async () => {
      const jwk = JSON.parse(jwkJson) as JWK;
      if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.kid) {
        throw new Error("SUPABASE_JWT_SIGNING_KEY must be a private EC P-256 JWK with a kid");
      }
      return { key: await importJWK(jwk, "ES256"), kid: jwk.kid };
    })();
    keyCache.set(jwkJson, p);
  }
  return p;
}

export async function mintClientJwt(jwkJson: string, clientId: string, now = Math.floor(Date.now() / 1000)) {
  const { key, kid } = await loadKey(jwkJson);
  return new SignJWT({ role: "authenticated", client_id: clientId })
    .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
    .setSubject(clientId)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + CLIENT_JWT_TTL_S)
    .sign(key);
}
