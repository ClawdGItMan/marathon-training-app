// @vitest-environment node
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken } from "@/lib/crypto/token-cipher";

/**
 * Behavioral tests for Task 7: the Whoop token-exchange client
 * (src/lib/integrations/whoop/client.ts) and the connect/callback route
 * handlers (src/app/api/integrations/whoop/{connect,callback}/route.ts).
 *
 * `next/headers`, `@/lib/supabase/admin`, and `@/lib/supabase/server` are
 * mocked so this runs without the Supabase stack or a real cookie jar.
 * `@/lib/integrations/oauth` is NOT mocked — makeState/assertState/
 * saveTokens/deleteTokens run for real (real crypto, real state
 * comparison), same approach as tests/unit/oauth.test.ts, so these tests
 * prove actual behavior rather than echoing mocks. `fetch` is stubbed per
 * test via `vi.stubGlobal` per the brief.
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
  WHOOP_AUTHORIZE_URL,
  WHOOP_SCOPES,
  WHOOP_TOKEN_URL,
  buildWhoopAuthorizeUrl,
  exchangeWhoopCode,
  refreshWhoopTokens,
} = await import("@/lib/integrations/whoop/client");

const { DELETE: connectDelete, GET: connectGet } = await import(
  "@/app/api/integrations/whoop/connect/route"
);
const { GET: callbackGet } = await import("@/app/api/integrations/whoop/callback/route");

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

function mockFetchOnce(status: number, json: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "mock-status",
    json: async () => json,
  });
}

describe("whoop client", () => {
  beforeEach(() => {
    vi.stubEnv("WHOOP_CLIENT_ID", "client-abc");
    vi.stubEnv("WHOOP_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("buildWhoopAuthorizeUrl includes the exact scopes, client id, redirect_uri, response_type and state", () => {
    const url = new URL(buildWhoopAuthorizeUrl("state-123"));

    expect(url.origin + url.pathname).toBe(WHOOP_AUTHORIZE_URL);
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/integrations/whoop/callback"
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(WHOOP_SCOPES);
    expect(WHOOP_SCOPES).toBe("read:recovery read:sleep read:workout read:cycles read:profile offline");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchangeWhoopCode posts the authorization_code grant and parses the response into a TokenBundle", async () => {
    const fetchMock = mockFetchOnce(200, {
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_in: 3600,
      scope: "read:recovery offline",
      token_type: "bearer",
    });
    vi.stubGlobal("fetch", fetchMock);
    const before = Date.now();

    const tokens = await exchangeWhoopCode("auth-code-xyz");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WHOOP_TOKEN_URL);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code-xyz");
    expect(body.get("client_id")).toBe("client-abc");
    expect(body.get("client_secret")).toBe("secret-xyz");
    expect(body.get("redirect_uri")).toBe("https://app.example.com/api/integrations/whoop/callback");

    expect(tokens.access).toBe("access-1");
    expect(tokens.refresh).toBe("refresh-1");
    const expiresAtMs = new Date(tokens.expiresAt!).getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 3600_000);
    expect(expiresAtMs).toBeLessThan(before + 3600_000 + 5_000);
  });

  it("refreshWhoopTokens posts the refresh_token grant with the offline scope and returns the rotated pair", async () => {
    const fetchMock = mockFetchOnce(200, {
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_in: 3600,
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refreshWhoopTokens("refresh-old");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WHOOP_TOKEN_URL);
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-old");
    expect(body.get("client_id")).toBe("client-abc");
    expect(body.get("client_secret")).toBe("secret-xyz");
    expect(body.get("scope")).toBe("offline");

    expect(tokens.access).toBe("access-2");
    expect(tokens.refresh).toBe("refresh-2");
  });

  it("throws on a non-ok token response rather than parsing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "invalid_grant" }),
      })
    );

    await expect(exchangeWhoopCode("bad-code")).rejects.toThrow();
  });

  it("throws when the token response JSON fails the wire schema (zod boundary)", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(200, { access_token: "only-this-field" }));

    await expect(exchangeWhoopCode("some-code")).rejects.toThrow();
  });
});

describe("connect route", () => {
  beforeEach(() => {
    vi.stubEnv("WHOOP_CLIENT_ID", "client-abc");
    vi.stubEnv("WHOOP_CLIENT_SECRET", "secret-xyz");
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

    const request = new NextRequest("https://app.example.com/api/integrations/whoop/connect");
    const response = await connectGet(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
    expect(jar._store.size).toBe(0);
  });

  it("GET redirects an authenticated request to the Whoop authorize URL with the exact scopes and a fresh state cookie", async () => {
    mockUser({ id: "user-1" });
    const jar = makeCookieJar();
    cookiesMock.mockResolvedValue(jar);

    const request = new NextRequest("https://app.example.com/api/integrations/whoop/connect");
    const response = await connectGet(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location")!;
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe(WHOOP_AUTHORIZE_URL);
    expect(url.searchParams.get("scope")).toBe(WHOOP_SCOPES);
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

  it("DELETE deletes the caller's Whoop token row, scoped to their user id", async () => {
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
    expect(deleteEq2).toHaveBeenCalledWith("provider", "whoop");
  });
});

describe("callback route", () => {
  beforeEach(() => {
    vi.stubEnv("WHOOP_CLIENT_ID", "client-abc");
    vi.stubEnv("WHOOP_CLIENT_SECRET", "secret-xyz");
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
      "https://app.example.com/api/integrations/whoop/callback?state=x&code=y"
    );
    const response = await callbackGet(request);

    expect(response.status).toBe(401);
  });

  it("403s on a state mismatch and never calls the Whoop token endpoint", async () => {
    mockUser({ id: "user-1" });
    const jar = makeCookieJar();
    jar.set("oauth_state", "real-state");
    cookiesMock.mockResolvedValue(jar);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://app.example.com/api/integrations/whoop/callback?state=WRONG&code=abc"
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
      "https://app.example.com/api/integrations/whoop/callback?state=anything&code=abc"
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
      "https://app.example.com/api/integrations/whoop/callback?state=WRONG&code=abc"
    );
    await callbackGet(request);

    expect(jar._store.has("oauth_state")).toBe(false);
  });

  it("happy path: exchanges the code, persists encrypted tokens scoped to the session user, redirects to /settings", async () => {
    mockUser({ id: "user-42" });
    const jar = makeCookieJar();
    jar.set("oauth_state", "real-state");
    cookiesMock.mockResolvedValue(jar);

    vi.stubGlobal(
      "fetch",
      mockFetchOnce(200, {
        access_token: "access-tok",
        refresh_token: "refresh-tok",
        expires_in: 3600,
      })
    );

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    getAdminClientMock.mockReturnValue({ from });

    const request = new NextRequest(
      "https://app.example.com/api/integrations/whoop/callback?state=real-state&code=auth-code"
    );
    const response = await callbackGet(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/settings?connected=whoop");

    expect(upsert).toHaveBeenCalledTimes(1);
    const [row] = upsert.mock.calls[0];
    expect(row.user_id).toBe("user-42");
    expect(row.provider).toBe("whoop");

    // Prove real encryption happened, not just that fields were forwarded.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("access-tok");
    expect(serialized).not.toContain("refresh-tok");
    const decrypted = JSON.parse(
      decryptToken({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag })
    );
    expect(decrypted).toEqual({ access: "access-tok", refresh: "refresh-tok" });

    expect(jar._store.has("oauth_state")).toBe(false);
  });

  it("a second callback replaying the same state after a successful one fails (state is single-use)", async () => {
    mockUser({ id: "user-42" });
    const jar = makeCookieJar();
    jar.set("oauth_state", "real-state");
    cookiesMock.mockResolvedValue(jar);

    const fetchMock = mockFetchOnce(200, {
      access_token: "access-tok",
      refresh_token: "refresh-tok",
      expires_in: 3600,
    });
    vi.stubGlobal("fetch", fetchMock);

    const upsert = vi.fn().mockResolvedValue({ error: null });
    getAdminClientMock.mockReturnValue({ from: vi.fn(() => ({ upsert })) });

    const first = await callbackGet(
      new NextRequest(
        "https://app.example.com/api/integrations/whoop/callback?state=real-state&code=auth-code"
      )
    );
    expect(first.status).toBe(307);

    const second = await callbackGet(
      new NextRequest(
        "https://app.example.com/api/integrations/whoop/callback?state=real-state&code=auth-code"
      )
    );

    expect(second.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
