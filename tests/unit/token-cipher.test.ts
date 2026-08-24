// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";

/**
 * Behavioral tests for the AES-256-GCM token cipher. Deliberately pure
 * node:crypto — no Supabase env vars are stubbed anywhere in this file, to
 * prove the module is importable and usable without the Supabase stack
 * (see the last test).
 */

function testKey(): string {
  // Never a real-looking key — freshly generated per call, discarded after
  // the test process exits.
  return randomBytes(32).toString("base64");
}

describe("token-cipher", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips plaintext through encryptToken then decryptToken", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());

    const plain = "whoop-access-token-abc123";
    const encrypted = encryptToken(plain);

    expect(decryptToken(encrypted)).toBe(plain);
  });

  it("emits a unique IV (and ciphertext) on every call for the same plaintext", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());

    const plain = "same-plaintext-both-times";
    const a = encryptToken(plain);
    const b = encryptToken(plain);

    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    // Both still decrypt correctly under their own IV/tag.
    expect(decryptToken(a)).toBe(plain);
    expect(decryptToken(b)).toBe(plain);
  });

  it("returns ciphertext/iv/tag as valid base64 strings", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());

    const { ciphertext, iv, tag } = encryptToken("x");

    for (const field of [ciphertext, iv, tag]) {
      // Round-tripping through Buffer.from/toString is base64-canonical only
      // for valid base64 input — a non-base64 string would not survive it.
      expect(Buffer.from(field, "base64").toString("base64")).toBe(field);
    }
    // IV is 12 bytes per the AES-GCM standard nonce size.
    expect(Buffer.from(iv, "base64")).toHaveLength(12);
  });

  it("throws when the auth tag has been tampered with", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());

    const encrypted = encryptToken("secret-refresh-token");
    const tamperedTag = Buffer.from(encrypted.tag, "base64");
    tamperedTag[0] ^= 0xff;

    expect(() => decryptToken({ ...encrypted, tag: tamperedTag.toString("base64") })).toThrow();
  });

  it("throws when the ciphertext has been tampered with", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());

    const encrypted = encryptToken("secret-refresh-token");
    const tamperedCiphertext = Buffer.from(encrypted.ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;

    expect(() =>
      decryptToken({ ...encrypted, ciphertext: tamperedCiphertext.toString("base64") })
    ).toThrow();
  });

  it("throws a clear error when TOKEN_ENCRYPTION_KEY is missing", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");

    expect(() => encryptToken("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("throws a clear error when TOKEN_ENCRYPTION_KEY does not decode to 32 bytes", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.from("too-short-key").toString("base64"));

    expect(() => encryptToken("x")).toThrow(/32 bytes/);
  });

  it("is importable and usable with no Supabase env vars set", () => {
    // No NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY stubbed here —
    // token-cipher.ts must not reach for them; it is a pure node:crypto
    // module, unlike admin.ts/oauth.ts.
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());

    expect(() => decryptToken(encryptToken("ok"))).not.toThrow();
  });
});
