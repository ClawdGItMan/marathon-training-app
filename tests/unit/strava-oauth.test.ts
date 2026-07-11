// @vitest-environment node
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import tokenExchangeFixture from "../fixtures/strava/token-exchange.json";
import tokenRefreshFixture from "../fixtures/strava/token-refresh.json";
import activityFixture from "../fixtures/strava/activity.json";
import activitiesFixture from "../fixtures/strava/activities.json";

/**
 * Behavioral tests for Task 10: the Strava token-exchange/refresh client
 * and data fetchers (src/lib/integrations/strava/client.ts), the
 * connect/callback route handlers
 * (src/app/api/integrations/strava/{connect,callback}/route.ts), and the
 * shared route/refresh plumbing those routes delegate to in
 * src/lib/integrations/oauth.ts (handleConnectGet/handleDisconnect/
 * handleCallback/fetchWithAutoRefresh — extracted here from Task 7's Whoop
 * code so neither provider duplicates it; see oauth.test.ts for direct
 * coverage of fetchWithAutoRefresh itself).
 *
 * Mirrors tests/unit/whoop-oauth.test.ts's structure and mocking approach:
 * `next/headers`, `@/lib/supabase/admin`, `@/lib/supabase/server` are
 * mocked; `@/lib/integrations/oauth` is NOT mocked, so state/token
 * plumbing runs for real. `fetch` is stubbed per test via `vi.stubGlobal`.
 *
 * Strava-specific facts under test (verified against
 * developers.strava.com/docs/authentication/ and .../docs/reference/ at
 * implementation time — see wire.ts's header comment):
 *  - Token responses carry an absolute `expires_at` epoch-seconds
 *    timestamp (not a duration like Whoop's `expires_in`).
 *  - `athlete.id` is present on the authorization_code exchange response
 *    and persisted as TokenBundle.athleteRef; it is ABSENT on refresh
 *    responses, and a refresh must NOT null out the previously-stored
 *    athleteRef (the "athleteRef preservation" tests below).
 *  - `listActivities`'s `after` param is Unix epoch seconds, not ISO.
 */

const { cookiesMock, getAdminClientMock, getServerClientMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getAdminClientMock: vi.fn(),
  getServerClientMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));
vi.mock("@/lib/supabase/server", () => ({ getServerClient: getServerClientMock }));

const {
  STRAVA_API_BASE,
  STRAVA_AUTHORIZE_URL,
  STRAVA_SCOPE,
  STRAVA_TOKEN_URL,
  buildStravaAuthorizeUrl,
  exchangeStravaCode,
  getActivity,
  listActivities,
  refreshStravaTokens,
} = await import("@/lib/integrations/strava/client");

const { DELETE: connectDelete, GET: connectGet } = await import(
  "@/app/api/integrations/strava/connect/route"
);
const { GET: callbackGet } = await import("@/app/api/integrations/strava/callback/route");

function testKey(): string {
  return randomBytes(32).toString("base64");
}

/** In-memory stand-in for Next's mutable cookie store (get/set/delete). */
function makeCookieJar() {
  const store = new Map<string, string>();
  return {
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (name: string) => {
      store.delete(name);
    },
    _store: store,
  };
}

function mockUser(user: { id: string } | null) {
  getServerClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "mock-status",
    json: async () => body,
  };
}

function mockFetchOnce(status: number, json: unknown) {
  return vi.fn().mockResolvedValue(jsonResponse(status, json));
}

describe("strava client — token exchange/refresh", () => {
  beforeEach(() => {
    vi.stubEnv("STRAVA_CLIENT_ID", "client-abc");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("buildStravaAuthorizeUrl includes the exact scope, client id, redirect_uri, response_type and state", () => {
    const url = new URL(buildStravaAuthorizeUrl("state-123"));

    expect(url.origin + url.pathname).toBe(STRAVA_AUTHORIZE_URL);
    expect(STRAVA_AUTHORIZE_URL).toBe("https://www.strava.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/integrations/strava/callback"
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("activity:read_all");
    expect(STRAVA_SCOPE).toBe("activity:read_all");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchangeStravaCode posts the authorization_code grant and parses the response into a TokenBundle with athleteRef", async () => {
    const fetchMock = mockFetchOnce(200, tokenExchangeFixture);
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeStravaCode("auth-code-xyz");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(STRAVA_TOKEN_URL);
    expect(STRAVA_TOKEN_URL).toBe("https://www.strava.com/oauth/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code-xyz");
    expect(body.get("client_id")).toBe("client-abc");
    expect(body.get("client_secret")).toBe("secret-xyz");

    expect(tokens.access).toBe(tokenExchangeFixture.access_token);
    expect(tokens.refresh).toBe(tokenExchangeFixture.refresh_token);
    // expires_at is absolute epoch SECONDS -> converted straight to an ISO instant.
    expect(tokens.expiresAt).toBe(new Date(tokenExchangeFixture.expires_at * 1000).toISOString());
    expect(tokens.athleteRef).toBe(String(tokenExchangeFixture.athlete.id));
  });

  it("refreshStravaTokens posts the refresh_token grant and returns the rotated pair without an athleteRef field", async () => {
    const fetchMock = mockFetchOnce(200, tokenRefreshFixture);
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refreshStravaTokens("refresh-old");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(STRAVA_TOKEN_URL);
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-old");
    expect(body.get("client_id")).toBe("client-abc");
    expect(body.get("client_secret")).toBe("secret-xyz");

    expect(tokens.access).toBe(tokenRefreshFixture.access_token);
    expect(tokens.refresh).toBe(tokenRefreshFixture.refresh_token);
    expect(tokens.expiresAt).toBe(new Date(tokenRefreshFixture.expires_at * 1000).toISOString());
    expect("athleteRef" in tokens).toBe(false);
  });

  it("throws on a non-ok token response rather than parsing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ message: "Bad Request", errors: [{ resource: "Application", field: "code", code: "invalid" }] }),
      })
    );

    await expect(exchangeStravaCode("bad-code")).rejects.toThrow();
  });

  it("throws when the token response JSON fails the wire schema (zod boundary)", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(200, { access_token: "only-this-field" }));

    await expect(exchangeStravaCode("some-code")).rejects.toThrow();
  });
});

describe("connect route", () => {
  beforeEach(() => {
    vi.stubEnv("STRAVA_CLIENT_ID", "client-abc");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("GET redirects an unauthenticated request to /sign-in and never sets a state cookie", async () => {
    mockUser(null);
    const jar = makeCookieJar();
    cookiesMock.mockResolvedValue(jar);

    const request = new NextRequest("https://app.example.com/api/integrations/strava/connect");
    const response = await connectGet(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
    expect(jar._store.size).toBe(0);
  });

  it("GET redirects an authenticated request to the Strava authorize URL with the exact scope and a fresh state cookie", async () => {
    mockUser({ id: "user-1" });
    const jar = makeCookieJar();
    cookiesMock.mockResolvedValue(jar);

    const request = new NextRequest("https://app.example.com/api/integrations/strava/connect");
    const response = await connectGet(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location")!;
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe(STRAVA_AUTHORIZE_URL);
    expect(url.searchParams.get("scope")).toBe(STRAVA_SCOPE);
    expect(url.searchParams.get("client_id")).toBe("client-abc");

    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(jar._store.get("oauth_state")).toBe(state);
  });

  it("DELETE without a session returns 401 and touches no data", async () => {
    mockUser(null);

    const response = await connectDelete();

    expect(response.status).toBe(401);
    expect(getAdminClientMock).not.toHaveBeenCalled();
  });

  it("DELETE deletes the caller's Strava token row, scoped to their user id", async () => {
    mockUser({ id: "user-1" });
    const deleteEq2 = vi.fn().mockResolvedValue({ error: null });
    const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
    const del = vi.fn(() => ({ eq: deleteEq1 }));
    const from = vi.fn(() => ({ delete: del }));
    getAdminClientMock.mockReturnValue({ from });

    const response = await connectDelete();

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("integration_tokens");
    expect(deleteEq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(deleteEq2).toHaveBeenCalledWith("provider", "strava");
  });
});

describe("callback route", () => {
  beforeEach(() => {
    vi.stubEnv("STRAVA_CLIENT_ID", "client-abc");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("401s when there is no session", async () => {
    mockUser(null);
    const jar = makeCookieJar();
    cookiesMock.mockResolvedValue(jar);

    const request = new NextRequest(
      "https://app.example.com/api/integrations/strava/callback?state=x&code=y"
    );
    const response = await callbackGet(request);

    expect(response.status).toBe(401);
  });

  it("403s on a state mismatch and never calls the Strava token endpoint", async () => {
    mockUser({ id: "user-1" });
    const jar = makeCookieJar();
    jar.set("oauth_state", "real-state");
    cookiesMock.mockResolvedValue(jar);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://app.example.com/api/integrations/strava/callback?state=WRONG&code=abc"
    );
    const response = await callbackGet(request);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403s when there is no state cookie at all", async () => {
    mockUser({ id: "user-1" });
    const jar = makeCookieJar();
    cookiesMock.mockResolvedValue(jar);

    const request = new NextRequest(
      "https://app.example.com/api/integrations/strava/callback?state=anything&code=abc"
    );
    const response = await callbackGet(request);

    expect(response.status).toBe(403);
  });

  it("clears the state cookie even on a mismatch, not only on success", async () => {
    mockUser({ id: "user-1" });
    const jar = makeCookieJar();
    jar.set("oauth_state", "real-state");
    cookiesMock.mockResolvedValue(jar);

    const request = new NextRequest(
      "https://app.example.com/api/integrations/strava/callback?state=WRONG&code=abc"
    );
    await callbackGet(request);

    expect(jar._store.has("oauth_state")).toBe(false);
  });

  it("happy path: exchanges the code, persists encrypted tokens + athleteRef scoped to the session user, redirects to /settings", async () => {
    mockUser({ id: "user-42" });
    const jar = makeCookieJar();
    jar.set("oauth_state", "real-state");
    cookiesMock.mockResolvedValue(jar);

    vi.stubGlobal("fetch", mockFetchOnce(200, tokenExchangeFixture));

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    getAdminClientMock.mockReturnValue({ from });

    const request = new NextRequest(
      "https://app.example.com/api/integrations/strava/callback?state=real-state&code=auth-code"
    );
    const response = await callbackGet(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/settings?connected=strava");

    expect(upsert).toHaveBeenCalledTimes(1);
    const [row] = upsert.mock.calls[0];
    expect(row.user_id).toBe("user-42");
    expect(row.provider).toBe("strava");
    expect(row.athlete_ref).toBe(String(tokenExchangeFixture.athlete.id));

    // Prove real encryption happened, not just that fields were forwarded.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(tokenExchangeFixture.access_token);
    expect(serialized).not.toContain(tokenExchangeFixture.refresh_token);
    const decrypted = JSON.parse(
      decryptToken({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag })
    );
    expect(decrypted).toEqual({
      access: tokenExchangeFixture.access_token,
      refresh: tokenExchangeFixture.refresh_token,
    });

    expect(jar._store.has("oauth_state")).toBe(false);
  });

  it("a second callback replaying the same state after a successful one fails (state is single-use)", async () => {
    mockUser({ id: "user-42" });
    const jar = makeCookieJar();
    jar.set("oauth_state", "real-state");
    cookiesMock.mockResolvedValue(jar);

    const fetchMock = mockFetchOnce(200, tokenExchangeFixture);
    vi.stubGlobal("fetch", fetchMock);

    const upsert = vi.fn().mockResolvedValue({ error: null });
    getAdminClientMock.mockReturnValue({ from: vi.fn(() => ({ upsert })) });

    const first = await callbackGet(
      new NextRequest(
        "https://app.example.com/api/integrations/strava/callback?state=real-state&code=auth-code"
      )
    );
    expect(first.status).toBe(307);

    const second = await callbackGet(
      new NextRequest(
        "https://app.example.com/api/integrations/strava/callback?state=real-state&code=auth-code"
      )
    );

    expect(second.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("data fetchers", () => {
  const userId = "user-42";

  beforeEach(() => {
    vi.stubEnv("STRAVA_CLIENT_ID", "client-abc");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /** Fluent admin-client fake backing saveTokens/loadTokens for the fetcher tests. */
  function makeFakeAdmin() {
    const rows = new Map<string, Record<string, unknown>>();
    const client = {
      from: () => ({
        select: () => ({
          eq: (col1: string, val1: string) => ({
            eq: (col2: string, val2: string) => ({
              maybeSingle: async () => ({
                data: rows.get(`${val1}:${val2}`) ?? null,
                error: null,
              }),
            }),
          }),
        }),
        upsert: async (row: Record<string, unknown>) => {
          rows.set(`${row.user_id}:${row.provider}`, row);
          return { error: null };
        },
      }),
    };
    return { client, rows };
  }

  it("getActivity fetches /activities/{id} and Zod-parses the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, activityFixture));
    vi.stubGlobal("fetch", fetchMock);

    const activity = await getActivity(
      { userId, tokens: { access: "access-1", refresh: "refresh-1" }, athleteRef: "athlete-1" },
      activityFixture.id
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${STRAVA_API_BASE}/activities/${activityFixture.id}`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-1");

    expect(activity.id).toBe(activityFixture.id);
    expect(activity.distance).toBe(activityFixture.distance);
    expect(activity.average_heartrate).toBe(activityFixture.average_heartrate);
  });

  it("getActivity throws when the response fails the wire schema (zod boundary)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { id: "not-a-number" })));

    await expect(
      getActivity(
        { userId, tokens: { access: "access-1", refresh: "refresh-1" }, athleteRef: null },
        999
      )
    ).rejects.toThrow();
  });

  it("listActivities converts the `after` Date into an epoch-seconds query param", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = new URL(input.toString());
      if (url.searchParams.get("page") === "1") return jsonResponse(200, activitiesFixture);
      return jsonResponse(200, []);
    });
    vi.stubGlobal("fetch", fetchMock);

    const after = new Date("2026-07-01T00:00:00.000Z");
    const activities = await listActivities(
      { userId, tokens: { access: "access-1", refresh: "refresh-1" }, athleteRef: null },
      { after }
    );

    expect(activities).toHaveLength(activitiesFixture.length);
    const [url] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(url));
    expect(parsedUrl.pathname).toBe("/api/v3/athlete/activities");
    expect(parsedUrl.searchParams.get("after")).toBe(
      String(Math.floor(after.getTime() / 1000))
    );
  });

  it("listActivities pages until a short page is returned, aggregating all records", async () => {
    // client.ts's per_page is 200 — a full page (exactly 200 records) must
    // NOT stop the loop, only a page shorter than that does. Page 1 returns
    // a full page to force a page-2 request; page 2 returns the (short)
    // fixture, ending the loop there.
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      ...activitiesFixture[0],
      id: activitiesFixture[0].id + i + 1,
    }));
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = new URL(input.toString());
      expect(url.searchParams.get("per_page")).toBe("200");
      const page = url.searchParams.get("page");
      if (page === "1") return jsonResponse(200, fullPage);
      if (page === "2") return jsonResponse(200, activitiesFixture);
      throw new Error(`unexpected page ${page}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const activities = await listActivities(
      { userId, tokens: { access: "access-1", refresh: "refresh-1" }, athleteRef: null },
      {}
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(activities).toHaveLength(fullPage.length + activitiesFixture.length);
  });

  it("a 401 refreshes, PERSISTS the rotated tokens while PRESERVING athleteRef, retries once, and succeeds", async () => {
    const { client: admin } = makeFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);

    // Seed the stored token row with an athleteRef, exactly as the OAuth
    // callback would have written it — proves the refresh path reads it
    // from ctx (not from a fresh DB read) and re-persists it unchanged.
    const encrypted = encryptToken(JSON.stringify({ access: "access-orig", refresh: "refresh-orig" }));
    admin.from().upsert({
      user_id: userId,
      provider: "strava",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      expires_at: "2026-07-01T00:00:00.000Z",
      athlete_ref: "athlete-99",
    });

    let recoveryCalls = 0;
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = new URL(input.toString());
      if (url.href === STRAVA_TOKEN_URL) return jsonResponse(200, tokenRefreshFixture);
      if (url.pathname.includes("/activities/")) {
        recoveryCalls += 1;
        if (recoveryCalls === 1) return jsonResponse(401, { message: "Authorization Error" });
        return jsonResponse(200, activityFixture);
      }
      throw new Error(`Unhandled URL: ${url.href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const ctx = {
      userId,
      tokens: { access: "access-orig", refresh: "refresh-orig" },
      athleteRef: "athlete-99",
    };
    const activity = await getActivity(ctx, activityFixture.id);

    expect(activity.id).toBe(activityFixture.id);
    expect(recoveryCalls).toBe(2);
    expect(ctx.tokens.access).toBe(tokenRefreshFixture.access_token);

    const tokenCalls = fetchMock.mock.calls.filter(([input]) => String(input) === STRAVA_TOKEN_URL);
    expect(tokenCalls).toHaveLength(1);

    const { loadTokens } = await import("@/lib/integrations/oauth");
    const stored = await loadTokens(userId, "strava");
    expect(stored).toEqual({
      access: tokenRefreshFixture.access_token,
      refresh: tokenRefreshFixture.refresh_token,
      expiresAt: expect.any(String),
      athleteRef: "athlete-99", // preserved, NOT nulled by the athlete-less refresh response
    });
  });

  it("a second 401 (after the one retry) is a hard failure", async () => {
    const { client: admin } = makeFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    const encrypted = encryptToken(JSON.stringify({ access: "access-orig", refresh: "refresh-orig" }));
    admin.from().upsert({
      user_id: userId,
      provider: "strava",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      expires_at: "2026-07-01T00:00:00.000Z",
      athlete_ref: null,
    });

    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = new URL(input.toString());
      if (url.href === STRAVA_TOKEN_URL) return jsonResponse(200, tokenRefreshFixture);
      if (url.pathname.includes("/activities/")) return jsonResponse(401, { message: "still invalid" });
      throw new Error(`Unhandled URL: ${url.href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const ctx = {
      userId,
      tokens: { access: "access-orig", refresh: "refresh-orig" },
      athleteRef: null,
    };

    await expect(getActivity(ctx, activityFixture.id)).rejects.toThrow();

    const activityCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/activities/"));
    expect(activityCalls).toHaveLength(2); // original + exactly one retry, no more
  });
});
