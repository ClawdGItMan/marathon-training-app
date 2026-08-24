import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM cipher for OAuth tokens at rest (integration_tokens.ciphertext/
 * iv/tag — see supabase/migrations/0001_schema.sql). Deliberately a pure
 * node:crypto module with no Supabase or Next.js imports, so it can be
 * unit-tested without the Supabase stack and is safe to import from
 * anywhere the tokens flow (route handlers, sync jobs, smoke scripts).
 *
 * Key: `TOKEN_ENCRYPTION_KEY`, base64-encoded, must decode to exactly 32
 * bytes (AES-256). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * IV: a fresh random 12 bytes (the standard GCM nonce size) on every
 * `encryptToken` call — GCM nonces must never repeat under the same key, so
 * the IV is generated per-call rather than derived or reused.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type EncryptedToken = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. It must be a base64-encoded 32-byte " +
        "AES-256 key — generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        "It must be a base64-encoded 32-byte AES-256 key (misconfiguration)."
    );
  }

  return key;
}

/** Encrypts `plain` with a fresh random IV. Never reuses an IV across calls. */
export function encryptToken(plain: string): EncryptedToken {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypts an `EncryptedToken`. Throws if the key is misconfigured or if
 * `ciphertext`/`tag` have been tampered with — GCM authentication fails
 * closed, via `decipher.final()` throwing.
 */
export function decryptToken({ ciphertext, iv, tag }: EncryptedToken): string {
  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);

  return plain.toString("utf8");
}
