import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

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
 */
export function assertState(
  cookieVal: string | null | undefined,
  param: string | null | undefined
): void {
  if (!cookieVal || !param || cookieVal !== param) {
    throw new Error("OAuth state mismatch: missing or non-matching state parameter.");
  }
}

// ---- token storage ----------------------------------------------------------
// integration_tokens has RLS enabled with zero policies (service-role only —
// see supabase/migrations/0001_schema.sql), so all reads/writes go through
// getAdminClient(). The row's single ciphertext/iv/tag triple encrypts a
// JSON payload of {access, refresh} together; expiresAt/athleteRef are
// stored in their own plaintext columns (not secret). The caller's identity
// comes from the request's own session (getServerClient().auth.getUser()),
// not a passed-in id — every caller (Whoop/Strava callback routes) already
// runs inside that same authenticated request.

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

async function getCurrentUserId(): Promise<string> {
  const client = await getServerClient();
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error("oauth: no authenticated user in the current session.");
  }

  return data.user.id;
}

/** Encrypts and upserts `tokens` for `provider`, keyed to the session's user. */
export async function saveTokens(provider: Provider, tokens: TokenBundle): Promise<void> {
  const parsedProvider = providerSchema.parse(provider);
  const userId = await getCurrentUserId();

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

/** Loads and decrypts the session user's tokens for `provider`, or null if never connected. */
export async function loadTokens(provider: Provider): Promise<TokenBundle | null> {
  const parsedProvider = providerSchema.parse(provider);
  const userId = await getCurrentUserId();

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
