import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, toBase64 } from "@/server/instagram/crypto";
import { composeDm, parseComments, verifySignature } from "@/server/instagram/webhook";

const SECRET = "app-secret-for-tests-0123456789";
const sign = (body: string, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("webhook signature (X-Hub-Signature-256)", () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  it("accepts Meta's HMAC-SHA256 of the raw body", async () => {
    expect(await verifySignature(SECRET, buf(body), sign(body))).toBe(true);
  });
  it("rejects a wrong secret, a changed body, a missing or malformed header", async () => {
    expect(await verifySignature(SECRET, buf(body), sign(body, "other-secret-xxxxxxxxxxxx"))).toBe(false);
    expect(await verifySignature(SECRET, buf(body + " "), sign(body))).toBe(false);
    expect(await verifySignature(SECRET, buf(body), null)).toBe(false);
    expect(await verifySignature(SECRET, buf(body), "sha1=abc")).toBe(false);
    expect(await verifySignature(SECRET, buf(body), "sha256=zz")).toBe(false);
  });
});

describe("webhook payload parsing", () => {
  const value = { id: "c1", from: { id: "u1", username: "rana" }, media: { id: "m1", media_product_type: "FEED" }, text: "بكم؟" };
  it("reads the Instagram Login shape (field/value on the entry)", () => {
    const p = { object: "instagram", entry: [{ id: "acct", time: 1, field: "comments", value }] };
    expect(parseComments(p)).toEqual([{ accountId: "acct", commentId: "c1", fromId: "u1", fromUsername: "rana", mediaId: "m1", text: "بكم؟" }]);
  });
  it("reads the changes[] shape and comment_id", () => {
    const p = { object: "instagram", entry: [{ id: "acct", changes: [{ field: "comments", value: { ...value, id: undefined, comment_id: "c2" } }] }] };
    expect(parseComments(p)[0]).toMatchObject({ commentId: "c2", accountId: "acct" });
  });
  it("ignores other objects, fields and malformed entries", () => {
    expect(parseComments({ object: "page", entry: [{ id: "a", field: "comments", value }] })).toEqual([]);
    expect(parseComments({ object: "instagram", entry: [{ id: "a", field: "mentions", value }] })).toEqual([]);
    expect(parseComments({ object: "instagram", entry: [{ field: "comments", value }, null, "x"] })).toEqual([]);
    expect(parseComments(null)).toEqual([]);
  });
});

describe("token encryption (AES-256-GCM)", () => {
  const key = randomBytes(32).toString("base64");
  it("round-trips and binds the ciphertext to the client id", async () => {
    const enc = await encryptToken(key, "client-a", "IGAAtoken");
    expect(await decryptToken(key, "client-a", toBase64(enc.ciphertext), toBase64(enc.iv))).toBe("IGAAtoken");
    await expect(decryptToken(key, "client-b", toBase64(enc.ciphertext), toBase64(enc.iv))).rejects.toThrow();
    await expect(decryptToken(randomBytes(32).toString("base64"), "client-a", toBase64(enc.ciphertext), toBase64(enc.iv))).rejects.toThrow();
  });
  it("uses a fresh IV every time", async () => {
    const a = await encryptToken(key, "c", "t");
    const b = await encryptToken(key, "c", "t");
    expect(toBase64(a.iv)).not.toBe(toBase64(b.iv));
  });
});

describe("private message composition", () => {
  it("text then link on its own line", () => {
    expect(composeDm("أهلًا", "https://shop.example.com")).toBe("أهلًا\nhttps://shop.example.com");
    expect(composeDm("", "https://x.example.com")).toBe("https://x.example.com");
    expect(composeDm(null, null)).toBe("");
  });
});
