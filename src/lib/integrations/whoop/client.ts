import { z } from "zod";

/**
 * Whoop API v2 OAuth token exchange + refresh (Task 7 scope only — the
 * sync/data client for recovery/sleep/workout endpoints is Task 8+). No
 * `import "server-only"` guard here: unlike src/lib/supabase/admin.ts, this
 * module is exercised directly (unmocked, mocked `fetch`) by
 * tests/unit/whoop-oauth.test.ts, and the `server-only` package throws
 * unconditionally outside Next's "react-server" bundling condition — see
 * src/lib/crypto/token-cipher.ts for the same tradeoff. It's only ever
 * imported from Route Handlers under src/app/api, which are inherently
 * server-side, so this is safe.
 *
 * Endpoints/scopes are the exact values from
 * .superpowers/sdd/p2-globals.md's Global Constraints (verified against
 * https://developer.whoop.com/docs/developing/oauth/ and
 * .../tutorials/refresh-token-javascript/ at implementation time).
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
