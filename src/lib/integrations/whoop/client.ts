import { z } from "zod";
import { saveTokens } from "@/lib/integrations/oauth";
import {
  whoopCycleCollectionSchema,
  whoopRecoveryCollectionSchema,
  whoopSleepCollectionSchema,
  whoopWorkoutCollectionSchema,
  type WhoopCycleRecord,
  type WhoopRecoveryRecord,
  type WhoopSleepRecord,
  type WhoopWorkoutRecord,
} from "./wire";

/**
 * Whoop API v2 OAuth token exchange + refresh (Task 7), plus the data
 * fetchers for the recovery/sleep/cycle/workout collection endpoints
 * (Task 8). No `import "server-only"` guard here: unlike
 * src/lib/supabase/admin.ts, this module is exercised directly (unmocked,
 * mocked `fetch`) by tests/unit/whoop-oauth.test.ts and
 * tests/unit/whoop-sync.test.ts, and the `server-only` package throws
 * unconditionally outside Next's "react-server" bundling condition — see
 * src/lib/crypto/token-cipher.ts for the same tradeoff. It's only ever
 * imported from Route Handlers / the sync layer under src/lib/integrations
 * and src/app/api, which are inherently server-side, so this is safe.
 *
 * Endpoints/scopes are the exact values from
 * .superpowers/sdd/p2-globals.md's Global Constraints (verified against
 * https://developer.whoop.com/docs/developing/oauth/ and
 * .../tutorials/refresh-token-javascript/ at implementation time). The v2
 * data-API base and collection endpoint shapes/pagination are verified
 * against https://developer.whoop.com/api/ and
 * .../docs/developing/pagination/ — see wire.ts's header comment for the
 * specifics.
 */

export const WHOOP_AUTHORIZE_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_SCOPES =
  "read:recovery read:sleep read:workout read:cycles read:profile offline";

/** Same shape as oauth.ts's TokenBundle — the direct input to saveTokens. */
export type WhoopTokens = {
  access: string;
  refresh: string;
  expiresAt: string;
  athleteRef: null;
};

const whoopTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (misconfiguration).`);
  return value;
}

/** `${NEXT_PUBLIC_APP_URL}/api/integrations/whoop/callback` — must match the redirect URL registered with Whoop. */
export function whoopRedirectUri(): string {
  return `${requireEnv("NEXT_PUBLIC_APP_URL")}/api/integrations/whoop/callback`;
}

/** Builds the Whoop authorize URL for the connect route's redirect. */
export function buildWhoopAuthorizeUrl(state: string): string {
  const url = new URL(WHOOP_AUTHORIZE_URL);
  url.searchParams.set("client_id", requireEnv("WHOOP_CLIENT_ID"));
  url.searchParams.set("redirect_uri", whoopRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", WHOOP_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

function toWhoopTokens(parsed: z.infer<typeof whoopTokenResponseSchema>): WhoopTokens {
  return {
    access: parsed.access_token,
    refresh: parsed.refresh_token,
    expiresAt: new Date(Date.now() + parsed.expires_in * 1000).toISOString(),
    athleteRef: null,
  };
}

/** POSTs `body` to Whoop's token endpoint and Zod-parses the response at the external-API boundary. */
async function requestToken(body: Record<string, string>): Promise<WhoopTokens> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    throw new Error(`Whoop token request failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return toWhoopTokens(whoopTokenResponseSchema.parse(json));
}

/** Exchanges an OAuth authorization `code` for a Whoop access/refresh token pair. */
export async function exchangeWhoopCode(code: string): Promise<WhoopTokens> {
  return requestToken({
    grant_type: "authorization_code",
    code,
    client_id: requireEnv("WHOOP_CLIENT_ID"),
    client_secret: requireEnv("WHOOP_CLIENT_SECRET"),
    redirect_uri: whoopRedirectUri(),
  });
}

/**
 * Exchanges a refresh token for a new access/refresh token pair. `scope:
 * offline` is required on the refresh request itself — Whoop only returns a
 * new refresh_token when the offline scope is (re-)requested.
 */
export async function refreshWhoopTokens(refresh: string): Promise<WhoopTokens> {
  return requestToken({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: requireEnv("WHOOP_CLIENT_ID"),
    client_secret: requireEnv("WHOOP_CLIENT_SECRET"),
    scope: "offline",
  });
}

// ---- data fetchers (Task 8) -------------------------------------------------
// Base URL is the exact value from p2-globals.md's Global Constraints.

export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";

/** Guards against an API that never empties `next_token` (malformed response or a bug on either side). */
const MAX_COLLECTION_PAGES = 50;

/**
 * Small, explicit auth context threaded through every data fetcher rather
 * than each fetcher resolving tokens itself: `tokens` is mutated in place
 * when a 401 triggers a refresh, so every subsequent fetcher call in the
 * same sync run (sync.ts calls these sequentially, never concurrently, for
 * exactly this reason) picks up the rotated access token automatically —
 * and `userId` is here so the refreshed pair can be persisted via
 * `saveTokens` at the moment it's minted, not passed back up and persisted
 * later (see the persistence call in `whoopFetch` below).
 */
export type WhoopAuthContext = {
  userId: string;
  tokens: { access: string; refresh: string };
};

/**
 * GETs `url` with the context's current access token. On a 401, refreshes
 * the token pair (Whoop rotates the refresh token on every use), persists
 * the rotated pair via `saveTokens` — BEFORE the retry, so a crash between
 * refresh and retry still leaves a live refresh token stored — updates
 * `ctx.tokens` in place, then retries exactly once. A second 401 (or any
 * other non-ok status) is a hard failure.
 */
async function whoopFetch(ctx: WhoopAuthContext, url: URL): Promise<unknown> {
  const attempt = () =>
    fetch(url.toString(), { headers: { Authorization: `Bearer ${ctx.tokens.access}` } });

  let res = await attempt();

  if (res.status === 401) {
    const rotated = await refreshWhoopTokens(ctx.tokens.refresh);
    ctx.tokens = { access: rotated.access, refresh: rotated.refresh };
    await saveTokens(ctx.userId, "whoop", {
      access: rotated.access,
      refresh: rotated.refresh,
      expiresAt: rotated.expiresAt,
      athleteRef: rotated.athleteRef,
    });
    res = await attempt();
  }

  if (!res.ok) {
    throw new Error(`Whoop API request failed: ${res.status} ${res.statusText} (${url.pathname})`);
  }

  return res.json();
}

/**
 * Pages through a v2 collection endpoint via `next_token`/`nextToken`
 * (response field is snake_case, the next-page request param is
 * camelCase — see wire.ts) until the response's `next_token` is
 * empty/absent, aggregating every page's `records`.
 */
async function fetchWhoopCollection<Rec>(
  ctx: WhoopAuthContext,
  path: string,
  parse: (json: unknown) => { records: Rec[]; next_token?: string | null },
  since?: Date
): Promise<Rec[]> {
  const records: Rec[] = [];
  let nextToken: string | undefined;
  let pages = 0;

  do {
    const url = new URL(`${WHOOP_API_BASE}${path}`);
    if (since) url.searchParams.set("start", since.toISOString());
    if (nextToken) url.searchParams.set("nextToken", nextToken);

    const parsed = parse(await whoopFetch(ctx, url));
    records.push(...parsed.records);
    nextToken = parsed.next_token || undefined;
    pages += 1;
  } while (nextToken && pages < MAX_COLLECTION_PAGES);

  return records;
}

/** `GET /recovery` — all recoveries for the user, optionally since a given instant. */
export async function fetchWhoopRecoveries(
  ctx: WhoopAuthContext,
  since?: Date
): Promise<WhoopRecoveryRecord[]> {
  return fetchWhoopCollection(ctx, "/recovery", (json) => whoopRecoveryCollectionSchema.parse(json), since);
}

/** `GET /activity/sleep` — all sleeps for the user, optionally since a given instant. */
export async function fetchWhoopSleeps(ctx: WhoopAuthContext, since?: Date): Promise<WhoopSleepRecord[]> {
  return fetchWhoopCollection(
    ctx,
    "/activity/sleep",
    (json) => whoopSleepCollectionSchema.parse(json),
    since
  );
}

/** `GET /cycle` — all physiological cycles for the user, optionally since a given instant. */
export async function fetchWhoopCycles(ctx: WhoopAuthContext, since?: Date): Promise<WhoopCycleRecord[]> {
  return fetchWhoopCollection(ctx, "/cycle", (json) => whoopCycleCollectionSchema.parse(json), since);
}

/** `GET /activity/workout` — all workouts for the user, optionally since a given instant. */
export async function fetchWhoopWorkouts(
  ctx: WhoopAuthContext,
  since?: Date
): Promise<WhoopWorkoutRecord[]> {
  return fetchWhoopCollection(
    ctx,
    "/activity/workout",
    (json) => whoopWorkoutCollectionSchema.parse(json),
    since
  );
}
