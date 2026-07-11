import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Shared OAuth plumbing used by both the Whoop and Strava connect/callback
 * routes (Tasks 7/10): CSRF state-cookie helpers and the encrypted token
 * store. Kept as one module specifically so neither integration duplicates
 * this logic — see docs/superpowers/plans/2026-07-09-phase-2-backend-integrations.md.
 */

export type Provider = "whoop" | "strava";
const providerSchema = z.enum(["whoop", "strava"]);

export type TokenBundle = {
  access: string;
  refresh: string;
  expiresAt: string | null;
  athleteRef?: string | null;
};

// ---- CSRF state -------------------------------------------------------------
// A 32-byte random hex value round-trips through an httpOnly cookie set on
// the connect leg and compared against the callback's `state` query param —
// standard OAuth CSRF protection. `makeState` owns the cookie write;
// `assertState` is a pure comparison so the callback route controls exactly
// when/how it reads the cookie (via `next/headers` `cookies()`) before
// calling it.

export const OAUTH_STATE_COOKIE = "oauth_state";
const STATE_COOKIE_MAX_AGE_S = 10 * 60; // 10 minutes — generous OAuth round-trip window

/** Generates a fresh CSRF state value and stores it in an httpOnly cookie. */
export async function makeState(): Promise<string> {
  const state = randomBytes(32).toString("hex");
  const store = await cookies();

  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE_S,
    path: "/",
  });

  return state;
}

/**
 * Throws unless `cookieVal` (read from the `OAUTH_STATE_COOKIE` cookie) and
 * `param` (the callback's `state` query param) are both present and equal.
 * Pure comparison — callers own reading the cookie/query param.
 *
 * Uses `timingSafeEqual` instead of `!==` so a mismatching state value can't
 * be distinguished by comparison timing (defense in depth: `state` is a
 * high-entropy random token, not a secret an attacker could brute force via
 * timing alone, but the safe comparison costs nothing here). Byte length is
 * checked first — `timingSafeEqual` throws on unequal-length buffers, so an
 * unequal length is routed to the same "state mismatch" error rather than
 * letting that exception leak past this function.
 */
export function assertState(
  cookieVal: string | null | undefined,
  param: string | null | undefined
): void {
  if (!cookieVal || !param) {
    throw new Error("OAuth state mismatch: missing or non-matching state parameter.");
  }

  const cookieBuf = Buffer.from(cookieVal, "utf8");
  const paramBuf = Buffer.from(param, "utf8");

  if (
    cookieBuf.length !== paramBuf.length ||
    !timingSafeEqual(cookieBuf, paramBuf)
  ) {
    throw new Error("OAuth state mismatch: missing or non-matching state parameter.");
  }
}

// ---- token storage ----------------------------------------------------------
// integration_tokens has RLS enabled with zero policies (service-role only —
// see supabase/migrations/0001_schema.sql), so all reads/writes go through
// getAdminClient(). The row's single ciphertext/iv/tag triple encrypts a
// JSON payload of {access, refresh} together; expiresAt/athleteRef are
// stored in their own plaintext columns (not secret). The caller's identity
// is passed in explicitly as `userId` rather than resolved from the request
// session: saveTokens/loadTokens are also called from cron and webhook route
// handlers (token refresh, provider webhooks) that have no user session to
// read cookies from — that's exactly why they use the service-role admin
// client instead of the RLS-scoped one. OAuth callback routes (Tasks 7/10)
// resolve the session user themselves and pass the id in here.

const tokenPayloadSchema = z.object({
  access: z.string(),
  refresh: z.string(),
});

const tokenRowSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  tag: z.string(),
  expires_at: z.string().nullable(),
  athlete_ref: z.string().nullable(),
});

/** Encrypts and upserts `tokens` for `userId`/`provider`. */
export async function saveTokens(
  userId: string,
  provider: Provider,
  tokens: TokenBundle
): Promise<void> {
  const parsedProvider = providerSchema.parse(provider);

  const payload: z.infer<typeof tokenPayloadSchema> = {
    access: tokens.access,
    refresh: tokens.refresh,
  };
  const { ciphertext, iv, tag } = encryptToken(JSON.stringify(payload));

  const { error } = await getAdminClient()
    .from("integration_tokens")
    .upsert(
      {
        user_id: userId,
        provider: parsedProvider,
        ciphertext,
        iv,
        tag,
        expires_at: tokens.expiresAt,
        athlete_ref: tokens.athleteRef ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

  if (error) throw error;
}

/** Loads and decrypts `userId`'s tokens for `provider`, or null if never connected. */
export async function loadTokens(
  userId: string,
  provider: Provider
): Promise<TokenBundle | null> {
  const parsedProvider = providerSchema.parse(provider);

  const { data, error } = await getAdminClient()
    .from("integration_tokens")
    .select("ciphertext, iv, tag, expires_at, athlete_ref")
    .eq("user_id", userId)
    .eq("provider", parsedProvider)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = tokenRowSchema.parse(data);
  const payload = tokenPayloadSchema.parse(
    JSON.parse(decryptToken({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag }))
  );

  return {
    access: payload.access,
    refresh: payload.refresh,
    expiresAt: row.expires_at,
    athleteRef: row.athlete_ref,
  };
}
