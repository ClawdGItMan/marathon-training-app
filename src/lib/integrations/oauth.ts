import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Shared OAuth plumbing used by both the Whoop and Strava connect/callback
 * routes (Tasks 7/10): CSRF state-cookie helpers, the encrypted token
 * store, session resolution, the refresh-retry fetch wrapper, and the
 * route handler bodies themselves (connect GET/DELETE, callback GET).
 * Kept as one module specifically so neither integration duplicates this
 * logic — see docs/superpowers/plans/2026-07-09-phase-2-backend-integrations.md
 * and the Task 10 review note: copy-paste divergence between whoop/ and
 * strava/ route/client code is rejected on review, so anything that isn't
 * a provider-specific wire shape or endpoint URL lives here instead.
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

/**
 * Deletes `userId`'s stored tokens for `provider` (Settings' DISCONNECT
 * action — Tasks 7/10's connect routes). Idempotent: deleting a row that
 * doesn't exist is not an error.
 */
export async function deleteTokens(userId: string, provider: Provider): Promise<void> {
  const parsedProvider = providerSchema.parse(provider);

  const { error } = await getAdminClient()
    .from("integration_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("provider", parsedProvider);

  if (error) throw error;
}

/**
 * Resolves a provider's athlete/user identifier (Strava's webhook
 * `owner_id`, stringified) back to our internal `userId` (Task 11) by
 * looking up the `integration_tokens` row whose `athlete_ref` matches —
 * the same column `exchangeStravaCode` populates at connect time. Returns
 * `null` (not a thrown error) when no connected user matches, since an
 * unresolvable athlete is an expected, non-exceptional webhook case (e.g. a
 * stale/foreign subscription), not a failure — the caller (the webhook
 * route) decides what to do with `null`.
 */
export async function findUserByAthleteRef(athleteRef: string, provider: Provider): Promise<string | null> {
  const parsedProvider = providerSchema.parse(provider);

  const { data, error } = await getAdminClient()
    .from("integration_tokens")
    .select("user_id")
    .eq("provider", parsedProvider)
    .eq("athlete_ref", athleteRef)
    .maybeSingle();
  if (error) throw error;

  return (data as { user_id?: string } | null)?.user_id ?? null;
}

/**
 * Reads a required env var or throws — used by both providers' client.ts
 * for client id/secret/app-url lookups (misconfiguration should fail loud,
 * not silently build a malformed URL or POST body). Small enough that it
 * was previously copy-pasted into whoop/client.ts and strava/client.ts
 * separately; moved here since it's genuinely provider-agnostic.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (misconfiguration).`);
  return value;
}

// ---- session resolution ------------------------------------------------------
// `/api` is excluded from src/middleware.ts's matcher, so every route under
// src/app/api/integrations/{whoop,strava} resolves + enforces auth itself.
// Centralized here so both providers' connect/callback routes read the
// session the same way.

export type SessionUser = { id: string };

/** Resolves the current session user (or null) via the SSR Supabase client. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { id: user.id } : null;
}

// ---- refresh-retry fetch wrapper ---------------------------------------------

/**
 * Auth context threaded through a provider's data fetchers: `tokens` is
 * mutated in place when a 401 triggers a refresh, so subsequent fetcher
 * calls sharing the same ctx object pick up the rotated access token
 * automatically. `athleteRef` is carried through (not re-derived) because
 * Strava's refresh response never resends the athlete object — without
 * this, a naive re-persist on every refresh would null out a value only
 * ever set once, at the initial OAuth exchange. Whoop has no athleteRef
 * concept at all, so its callers simply omit the field and every refresh
 * persists `null`, which is what it always was.
 */
export type RefreshableAuthContext = {
  userId: string;
  tokens: { access: string; refresh: string };
  athleteRef?: string | null;
};

/**
 * GETs `url` with the context's current access token. On a 401, calls
 * `refresh(ctx.tokens.refresh)`, persists the rotated pair via
 * `saveTokens` — BEFORE the retry, so a crash between refresh and retry
 * still leaves a live refresh token stored — updates `ctx.tokens` in
 * place, then retries exactly once. Returns the (possibly still non-ok)
 * `Response` either way; turning a non-ok response into a thrown error
 * (and parsing the body) is left to the caller, since the error message
 * and success-path parsing are provider-specific.
 *
 * Extracted from Task 7's Whoop-only `whoopFetch` for Task 10 (reviewer
 * note: this refresh-retry flow is identical across providers — only the
 * token endpoint and the athleteRef nuance above differ).
 */
export async function fetchWithAutoRefresh(
  url: URL,
  provider: Provider,
  ctx: RefreshableAuthContext,
  refresh: (refreshToken: string) => Promise<{ access: string; refresh: string; expiresAt: string }>
): Promise<Response> {
  const attempt = () =>
    fetch(url.toString(), { headers: { Authorization: `Bearer ${ctx.tokens.access}` } });

  let res = await attempt();

  if (res.status === 401) {
    const rotated = await refresh(ctx.tokens.refresh);
    ctx.tokens = { access: rotated.access, refresh: rotated.refresh };
    await saveTokens(ctx.userId, provider, {
      access: rotated.access,
      refresh: rotated.refresh,
      expiresAt: rotated.expiresAt,
      athleteRef: ctx.athleteRef ?? null,
    });
    res = await attempt();
  }

  return res;
}

// ---- shared connect/callback route bodies -------------------------------------
// The Whoop and Strava connect/callback route files (Tasks 7/10) are thin
// wrappers around these three functions, passing in only what's genuinely
// provider-specific: the authorize-URL builder and the code-exchange
// function. See src/app/api/integrations/{whoop,strava}/{connect,callback}/route.ts.

function capitalizeProvider(provider: Provider): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Connect route's GET body: unauthenticated requests redirect to /sign-in
 * (this route is browser-navigated — the Settings CONNECT link — so a
 * redirect matches the middleware's own treatment of app routes, rather
 * than a bare 401); authenticated requests get a fresh CSRF state cookie
 * and are redirected to the provider's authorize URL.
 */
export async function handleConnectGet(
  request: NextRequest,
  buildAuthorizeUrl: (state: string) => string
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const state = await makeState();
  return NextResponse.redirect(buildAuthorizeUrl(state));
}

/** Connect route's DELETE body: disconnects by deleting the caller's stored tokens for `provider`. */
export async function handleDisconnect(provider: Provider): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteTokens(user.id, provider);
  return NextResponse.json({ ok: true });
}

/**
 * Callback route's GET body. Unlike the browser-navigated connect route, an
 * unauthenticated callback is a hard error (401) rather than a redirect —
 * by the time the provider calls back, the session that started the flow
 * should still be present.
 *
 * Security (Task 6 review, carried forward): the state cookie is read AND
 * cleared in the same request, unconditionally, right after the
 * assertState check — before the token exchange is even attempted — so a
 * state value is single-use regardless of whether assertState
 * passed/failed or the exchange later succeeds/fails. This is what makes a
 * replayed callback with the same state fail on its second attempt.
 */
export async function handleCallback(
  request: NextRequest,
  options: { provider: Provider; exchangeCode: (code: string) => Promise<TokenBundle> }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await cookies();
  const cookieVal = store.get(OAUTH_STATE_COOKIE)?.value;
  const stateParam = request.nextUrl.searchParams.get("state");

  try {
    assertState(cookieVal, stateParam);
  } catch {
    return NextResponse.json({ error: "Invalid state" }, { status: 403 });
  } finally {
    store.delete(OAUTH_STATE_COOKIE);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  try {
    const tokens = await options.exchangeCode(code);
    await saveTokens(user.id, options.provider, tokens);
  } catch {
    return NextResponse.json(
      { error: `Failed to connect ${capitalizeProvider(options.provider)}` },
      { status: 502 }
    );
  }

  return NextResponse.redirect(new URL(`/settings?connected=${options.provider}`, request.url));
}
