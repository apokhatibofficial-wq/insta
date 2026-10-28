import { describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, jwtVerify } from "jose";
import { CLIENT_JWT_TTL_S, mintClientJwt } from "@/server/auth/jwt";

describe("client JWT for Supabase RLS", () => {
  it("ES256 with kid; role=authenticated, client_id claim, ≤5 minutes", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = { ...(await exportJWK(privateKey)), kid: "test-kid" };
    const clientId = "7b0c3f7e-8d7a-4a51-9a0d-3a2b1c0d9e8f";
    const token = await mintClientJwt(JSON.stringify(jwk), clientId);
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, { audience: "authenticated" });
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "test-kid", typ: "JWT" });
    expect(payload).toMatchObject({ role: "authenticated", client_id: clientId, sub: clientId });
    expect(payload.exp! - payload.iat!).toBe(CLIENT_JWT_TTL_S);
    expect(CLIENT_JWT_TTL_S).toBeLessThanOrEqual(300);
  });

  it("refuses symmetric or public-only keys", async () => {
    const { publicKey } = await generateKeyPair("ES256", { extractable: true });
    const pub = { ...(await exportJWK(publicKey)), kid: "k" };
    await expect(mintClientJwt(JSON.stringify(pub), "x")).rejects.toThrow(/private EC P-256/);
    await expect(mintClientJwt(JSON.stringify({ kty: "oct", k: "abc", kid: "k" }), "x")).rejects.toThrow();
  });
});
