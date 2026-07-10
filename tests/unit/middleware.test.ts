// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for src/middleware.ts.
 *
 * These import the real `middleware` and `config` exports and mock only
 * `@supabase/ssr`'s `createServerClient`, capturing the `cookies.setAll`
 * callback the middleware wires up so tests can simulate Supabase mutating
 * cookies (token refresh, signOut) exactly as it would in production. This
 * is what lets these tests fail if the cookie-copy-to-redirect-response
 * loops in the middleware are removed or broken (see the RED-evidence run
 * documented in .superpowers/sdd/task-2-report.md).
 */

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

type SupabaseClientOpts = {
  cookies: { setAll: (cookies: CookieToSet[]) => void };
};

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

const { config, middleware } = await import("@/middleware");

/**
 * Wires the mocked createServerClient to return a fake Supabase client whose
 * auth methods are supplied by the caller, and captures the `setAll` cookie
 * callback so a test can simulate Supabase writing cookies mid-request.
 */
function mockSupabaseClient(overrides: {
  getUser: () => Promise<{ data: { user: { email: string } | null } }>;
  signOut?: () => Promise<{ error: null }>;
}) {
  const state: { setAll?: (cookies: CookieToSet[]) => void } = {};

  createServerClientMock.mockImplementation((_url: string, _key: string, clientOpts: SupabaseClientOpts) => {
    state.setAll = clientOpts.cookies.setAll;
    return {
      auth: {
        getUser: overrides.getUser,
        signOut: overrides.signOut ?? vi.fn().mockResolvedValue({ error: null }),
      },
    };
  });

  return {
    emitCookies: (cookies: CookieToSet[]) => state.setAll?.(cookies),
  };
}

describe("middleware (supabase mode)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "dummy-anon-key");
    vi.stubEnv("ALLOWED_EMAIL", "owner@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("redirects a signed-in but disallowed email to /sign-in?e=denied and propagates the signOut cookie", async () => {
    const supabase = mockSupabaseClient({
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: "intruder@x.com" } } }),
      signOut: vi.fn().mockImplementation(async () => {
        supabase.emitCookies([{ name: "sb-test-auth-token", value: "", options: { maxAge: 0 } }]);
        return { error: null };
      }),
    });

    const request = new NextRequest("http://localhost:3000/today");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/sign-in");
    expect(location).toContain("e=denied");

    // This is the assertion that fails if the cookie-copy loop after
    // signOut() is removed from the middleware (see RED-evidence run).
    const cookie = response.cookies.get("sb-test-auth-token");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("");
  });

  it("redirects an unauthenticated request to /sign-in and propagates a token refreshed during getUser()", async () => {
    const supabase = mockSupabaseClient({
      getUser: vi.fn().mockImplementation(async () => {
        supabase.emitCookies([{ name: "sb-test-auth-token", value: "refreshed", options: {} }]);
        return { data: { user: null } };
      }),
    });

    const request = new NextRequest("http://localhost:3000/today");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");

    const cookie = response.cookies.get("sb-test-auth-token");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("refreshed");
  });
});

describe("middleware (local mode)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("is a no-op that never talks to Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "local");

    const request = new NextRequest("http://localhost:3000/today");
    const response = await middleware(request);

    expect(response.status).not.toBe(307);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });
});

describe("middleware config", () => {
  it("excludes /api routes from the matcher via a negative lookahead", () => {
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toContain("(?!api");
  });
});
