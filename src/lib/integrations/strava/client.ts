import { z } from "zod";
import { fetchWithAutoRefresh, requireEnv, type RefreshableAuthContext } from "@/lib/integrations/oauth";
import { stravaActivitySchema, stravaTokenResponseSchema, type StravaActivity } from "./wire";

/**
 * Strava API v3 OAuth token exchange/refresh (Task 10), plus the
 * getActivity/listActivities data fetchers. Mirrors
 * src/lib/integrations/whoop/client.ts's structure exactly; the
 * refresh-retry fetch wrapper and the connect/callback route bodies are
 * shared via src/lib/integrations/oauth.ts rather than duplicated here —
 * see that module for the flow logic. No `import "server-only"` guard,
 * same tradeoff as whoop/client.ts: this module is exercised directly
 * (unmocked, mocked `fetch`) by tests/unit/strava-oauth.test.ts, and is
 * only ever imported from Route Handlers / the sync layer, which are
 * inherently server-side.
 *
 * Endpoints/scope are the exact values from p2-globals.md's Global
 * Constraints (verified against
 * https://developers.strava.com/docs/authentication/ at implementation
 * time). See wire.ts's header comment for the verified token/activity
 * response shapes.
 */

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_SCOPE = "activity:read_all";
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";

/** Same shape as oauth.ts's TokenBundle — the direct input to saveTokens. */
export type StravaTokens = {
  access: string;
  refresh: string;
  expiresAt: string;
  athleteRef: string | null;
};

/**
 * Deliberately omits `athleteRef` (rather than typing it `null`): Strava's
 * refresh response never includes the athlete object, and a refresh must
 * never overwrite a previously-stored athleteRef. See
 * StravaAuthContext/fetchWithAutoRefresh below for how the value is
 * preserved across a refresh instead.
 */
export type StravaRefreshedTokens = {
  access: string;
  refresh: string;
  expiresAt: string;
};

/** `${NEXT_PUBLIC_APP_URL}/api/integrations/strava/callback` — must match the redirect URL registered with Strava. */
export function stravaRedirectUri(): string {
  return `${requireEnv("NEXT_PUBLIC_APP_URL")}/api/integrations/strava/callback`;
}

/** Builds the Strava authorize URL for the connect route's redirect. */
export function buildStravaAuthorizeUrl(state: string): string {
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.searchParams.set("client_id", requireEnv("STRAVA_CLIENT_ID"));
  url.searchParams.set("redirect_uri", stravaRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", STRAVA_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Strava's `expires_at` is an absolute epoch-SECONDS timestamp — convert straight to an ISO instant. */
function toExpiresAtIso(expiresAtEpochSeconds: number): string {
  return new Date(expiresAtEpochSeconds * 1000).toISOString();
}

/** POSTs `body` to Strava's token endpoint and Zod-parses the response at the external-API boundary. */
async function requestToken(body: Record<string, string>): Promise<z.infer<typeof stravaTokenResponseSchema>> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    throw new Error(`Strava token request failed: ${res.status} ${res.statusText}`);
  }

  return stravaTokenResponseSchema.parse(await res.json());
}

/** Exchanges an OAuth authorization `code` for a Strava access/refresh token pair + the connecting athlete's id. */
export async function exchangeStravaCode(code: string): Promise<StravaTokens> {
  const parsed = await requestToken({
    grant_type: "authorization_code",
    code,
    client_id: requireEnv("STRAVA_CLIENT_ID"),
    client_secret: requireEnv("STRAVA_CLIENT_SECRET"),
  });

  return {
    access: parsed.access_token,
    refresh: parsed.refresh_token,
    expiresAt: toExpiresAtIso(parsed.expires_at),
    athleteRef: parsed.athlete ? String(parsed.athlete.id) : null,
  };
}

/**
 * Exchanges a refresh token for a new access/refresh token pair. Strava
 * rotates the refresh token "on all successful requests" per the docs, but
 * the response never includes the athlete object — hence the narrower
 * `StravaRefreshedTokens` return type (see its doc comment).
 */
export async function refreshStravaTokens(refresh: string): Promise<StravaRefreshedTokens> {
  const parsed = await requestToken({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: requireEnv("STRAVA_CLIENT_ID"),
    client_secret: requireEnv("STRAVA_CLIENT_SECRET"),
  });

  return {
    access: parsed.access_token,
    refresh: parsed.refresh_token,
    expiresAt: toExpiresAtIso(parsed.expires_at),
  };
}

// ---- data fetchers -----------------------------------------------------------

/**
 * Strava's counterpart to whoop/client.ts's WhoopAuthContext — the same
 * RefreshableAuthContext shape, but `athleteRef` is required (not
 * optional) here: every Strava-connected user has one from the moment
 * they connect (exchangeStravaCode always sets it), and callers must
 * thread it through explicitly so a token refresh mid-fetch preserves it
 * (see oauth.ts's fetchWithAutoRefresh).
 */
export type StravaAuthContext = RefreshableAuthContext & { athleteRef: string | null };

/**
 * GETs `url` with the context's current access token, auto-refreshing
 * once on a 401 via oauth.ts's shared `fetchWithAutoRefresh`. A second 401
 * (or any other non-ok status) is a hard failure.
 */
async function stravaFetch(ctx: StravaAuthContext, url: URL): Promise<unknown> {
  const res = await fetchWithAutoRefresh(url, "strava", ctx, refreshStravaTokens);

  if (!res.ok) {
    throw new Error(`Strava API request failed: ${res.status} ${res.statusText} (${url.pathname})`);
  }

  return res.json();
}

/** `GET /activities/{id}` — a single activity's detail. */
export async function getActivity(ctx: StravaAuthContext, id: number | string): Promise<StravaActivity> {
  const url = new URL(`${STRAVA_API_BASE}/activities/${id}`);
  return stravaActivitySchema.parse(await stravaFetch(ctx, url));
}

/** Strava's documented max `per_page`; also this fetcher's page-continuation signal (a short page ends the loop). */
const LIST_PER_PAGE = 200;
/** Guards against an API that never returns a short final page (malformed response or a bug on either side). */
const MAX_LIST_PAGES = 20;

/**
 * `GET /athlete/activities` — all of the connected athlete's activities,
 * optionally filtered to those starting after `opts.after`. Strava's
 * `after` query param is Unix epoch SECONDS, not an ISO string, hence the
 * explicit `Math.floor(.../1000)` conversion. Pages via `page`/`per_page`
 * until a page comes back shorter than requested, aggregating every
 * page's activities (the endpoint has no total-count header to stop on).
 */
export async function listActivities(
  ctx: StravaAuthContext,
  opts: { after?: Date } = {}
): Promise<StravaActivity[]> {
  const activities: StravaActivity[] = [];

  for (let page = 1; page <= MAX_LIST_PAGES; page++) {
    const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
    if (opts.after) {
      url.searchParams.set("after", String(Math.floor(opts.after.getTime() / 1000)));
    }
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(LIST_PER_PAGE));

    const parsed = z.array(stravaActivitySchema).parse(await stravaFetch(ctx, url));
    activities.push(...parsed);

    if (parsed.length < LIST_PER_PAGE) break;
  }

  return activities;
}
