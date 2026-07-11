// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/crypto/token-cipher";

/**
 * Behavioral tests for src/lib/integrations/oauth.ts — the shared CSRF-state
 * cookie helpers and the encrypted token store used by both the Whoop and
 * Strava connect/callback routes (Tasks 7/10), plus cron/webhook handlers
 * that call saveTokens/loadTokens with no user session (hence the explicit
 * `userId` parameter rather than session resolution).
 *
 * `@/lib/supabase/admin` is mocked so this file runs without the Supabase
 * stack; `next/headers` is mocked for the same reason (`makeState` sets a
 * real httpOnly cookie in production). `token-cipher` is NOT mocked —
 * saveTokens/loadTokens are exercised against the real AES-256-GCM
 * implementation so the tests prove actual encryption/decryption happens,
 * not just that the right functions were called.
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
  assertState,
  deleteTokens,
  fetchWithAutoRefresh,
  findUserByAthleteRef,
  getSessionUser,
  loadTokens,
  makeState,
  OAUTH_STATE_COOKIE,
  saveTokens,
} = await import("@/lib/integrations/oauth");

function testKey(): string {
  return randomBytes(32).toString("base64");
}

/** Fluent mock mirroring the two supabase-js chains oauth.ts uses. */
function makeAdminClientMock(opts: {
  upsertResult?: { error: unknown };
  selectResult?: { data: unknown; error: unknown };
}) {
  const upsert = vi.fn().mockResolvedValue(opts.upsertResult ?? { error: null });
  const maybeSingle = vi.fn().mockResolvedValue(opts.selectResult ?? { data: null, error: null });
  const eq2 = vi.fn(() => ({ maybeSingle }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ upsert, select }));
  return { from, upsert, select, eq1, eq2, maybeSingle };
}

describe("assertState", () => {
  it("does not throw when the cookie value matches the query param", () => {
    expect(() => assertState("abc123", "abc123")).not.toThrow();
  });

  it("throws when the cookie value and query param mismatch (same length)", () => {
    expect(() => assertState("abc123", "xyz789")).toThrow(
      /state mismatch/i
    );
  });

  it("throws when the cookie value and query param mismatch (different length)", () => {
    expect(() => assertState("abc123", "abc1234567")).toThrow(
      /state mismatch/i
    );
  });

  it("throws when the cookie value is missing", () => {
    expect(() => assertState(undefined, "abc123")).toThrow();
    expect(() => assertState(null, "abc123")).toThrow();
  });

  it("throws when the query param is missing", () => {
    expect(() => assertState("abc123", undefined)).toThrow();
    expect(() => assertState("abc123", null)).toThrow();
  });

  it("throws when both are missing", () => {
    expect(() => assertState(undefined, undefined)).toThrow();
    expect(() => assertState(null, null)).toThrow();
  });
});

describe("makeState", () => {
  it("sets a 32-byte-hex value in an httpOnly cookie and returns that same value", async () => {
    const set = vi.fn();
    cookiesMock.mockResolvedValue({ set });

    const state = await makeState();

    expect(state).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex-encoded
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, options] = set.mock.calls[0];
    expect(name).toBe(OAUTH_STATE_COOKIE);
    expect(value).toBe(state);
    expect(options).toMatchObject({ httpOnly: true });
  });

  it("generates a different state on every call", async () => {
    cookiesMock.mockResolvedValue({ set: vi.fn() });

    const a = await makeState();
    const b = await makeState();

    expect(a).not.toBe(b);
  });
});

describe("saveTokens / loadTokens", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("saveTokens upserts encrypted fields (never the plaintext tokens), scoped to the passed-in userId", async () => {
    const admin = makeAdminClientMock({});
    getAdminClientMock.mockReturnValue(admin);

    await saveTokens("user-123", "whoop", {
      access: "whoop-access-plaintext",
      refresh: "whoop-refresh-plaintext",
      expiresAt: "2026-08-01T00:00:00.000Z",
      athleteRef: "athlete-42",
    });

    expect(admin.from).toHaveBeenCalledWith("integration_tokens");
    expect(admin.upsert).toHaveBeenCalledTimes(1);
    const [row, upsertOpts] = admin.upsert.mock.calls[0];

    expect(row).toMatchObject({
      user_id: "user-123",
      provider: "whoop",
      expires_at: "2026-08-01T00:00:00.000Z",
      athlete_ref: "athlete-42",
    });
    expect(typeof row.ciphertext).toBe("string");
    expect(typeof row.iv).toBe("string");
    expect(typeof row.tag).toBe("string");

    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("whoop-access-plaintext");
    expect(serialized).not.toContain("whoop-refresh-plaintext");
    expect(upsertOpts).toMatchObject({ onConflict: "user_id,provider" });
  });

  it("saveTokens scopes different users to different rows (no shared-user cross talk)", async () => {
    const admin = makeAdminClientMock({});
    getAdminClientMock.mockReturnValue(admin);

    await saveTokens("user-123", "whoop", {
      access: "a1",
      refresh: "r1",
      expiresAt: null,
      athleteRef: null,
    });
    await saveTokens("user-456", "whoop", {
      access: "a2",
      refresh: "r2",
      expiresAt: null,
      athleteRef: null,
    });

    expect(admin.upsert).toHaveBeenCalledTimes(2);
    const [firstRow] = admin.upsert.mock.calls[0];
    const [secondRow] = admin.upsert.mock.calls[1];
    expect(firstRow.user_id).toBe("user-123");
    expect(secondRow.user_id).toBe("user-456");
  });

  it("loadTokens decrypts the stored row back into the original access/refresh tokens, scoped by the passed-in userId", async () => {
    const encrypted = encryptToken(JSON.stringify({ access: "a-tok", refresh: "r-tok" }));
    const admin = makeAdminClientMock({
      selectResult: {
        data: {
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          expires_at: "2026-08-01T00:00:00.000Z",
          athlete_ref: "athlete-42",
        },
        error: null,
      },
    });
    getAdminClientMock.mockReturnValue(admin);

    const result = await loadTokens("user-123", "strava");

    expect(admin.from).toHaveBeenCalledWith("integration_tokens");
    expect(admin.select).toHaveBeenCalledWith(
      "ciphertext, iv, tag, expires_at, athlete_ref"
    );
    expect(admin.eq1).toHaveBeenCalledWith("user_id", "user-123");
    expect(admin.eq2).toHaveBeenCalledWith("provider", "strava");
    expect(result).toEqual({
      access: "a-tok",
      refresh: "r-tok",
      expiresAt: "2026-08-01T00:00:00.000Z",
      athleteRef: "athlete-42",
    });
  });

  it("loadTokens returns null when no row exists for the user/provider", async () => {
    const admin = makeAdminClientMock({ selectResult: { data: null, error: null } });
    getAdminClientMock.mockReturnValue(admin);

    expect(await loadTokens("user-123", "whoop")).toBeNull();
  });
});

describe("deleteTokens", () => {
  /** Fluent mock for the delete().eq().eq() chain deleteTokens uses. */
  function makeDeleteAdminClientMock(result: { error: unknown } = { error: null }) {
    const eq2 = vi.fn().mockResolvedValue(result);
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ delete: del }));
    return { from, delete: del, eq1, eq2 };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the row scoped to the passed-in userId and provider", async () => {
    const admin = makeDeleteAdminClientMock();
    getAdminClientMock.mockReturnValue(admin);

    await deleteTokens("user-123", "whoop");

    expect(admin.from).toHaveBeenCalledWith("integration_tokens");
    expect(admin.delete).toHaveBeenCalledTimes(1);
    expect(admin.eq1).toHaveBeenCalledWith("user_id", "user-123");
    expect(admin.eq2).toHaveBeenCalledWith("provider", "whoop");
  });

  it("throws when the delete errors", async () => {
    const admin = makeDeleteAdminClientMock({ error: { message: "boom" } });
    getAdminClientMock.mockReturnValue(admin);

    await expect(deleteTokens("user-123", "strava")).rejects.toBeTruthy();
  });
});

describe("findUserByAthleteRef", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the userId whose integration_tokens row matches provider + athlete_ref", async () => {
    const admin = makeAdminClientMock({ selectResult: { data: { user_id: "user-123" }, error: null } });
    getAdminClientMock.mockReturnValue(admin);

    const result = await findUserByAthleteRef("10129358", "strava");

    expect(result).toBe("user-123");
    expect(admin.from).toHaveBeenCalledWith("integration_tokens");
    expect(admin.select).toHaveBeenCalledWith("user_id");
    expect(admin.eq1).toHaveBeenCalledWith("provider", "strava");
    expect(admin.eq2).toHaveBeenCalledWith("athlete_ref", "10129358");
  });

  it("returns null (not a throw) when no connected user matches the athlete ref", async () => {
    const admin = makeAdminClientMock({ selectResult: { data: null, error: null } });
    getAdminClientMock.mockReturnValue(admin);

    expect(await findUserByAthleteRef("unknown-athlete", "strava")).toBeNull();
  });

  it("throws when the query errors", async () => {
    const admin = makeAdminClientMock({ selectResult: { data: null, error: { message: "boom" } } });
    getAdminClientMock.mockReturnValue(admin);

    await expect(findUserByAthleteRef("10129358", "strava")).rejects.toBeTruthy();
  });
});

describe("getSessionUser", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there is no session", async () => {
    getServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    expect(await getSessionUser()).toBeNull();
  });

  it("returns the session user's id when there is a session", async () => {
    getServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-77" } } }) },
    });

    expect(await getSessionUser()).toEqual({ id: "user-77" });
  });
});

describe("fetchWithAutoRefresh", () => {
  /** Fluent admin-client fake backing saveTokens/loadTokens for these tests. */
  function makeFakeAdmin() {
    const rows = new Map<string, Record<string, unknown>>();
    const client = {
      from: () => ({
        upsert: async (row: Record<string, unknown>) => {
          rows.set(`${row.user_id}:${row.provider}`, row);
          return { error: null };
        },
      }),
    };
    return { client, rows };
  }

  beforeEach(() => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns the first response as-is and never calls refresh when it isn't a 401", async () => {
    getAdminClientMock.mockReturnValue(makeFakeAdmin().client);
    const okResponse = { ok: true, status: 200, statusText: "OK", json: async () => ({ hello: "world" }) };
    const fetchMock = vi.fn().mockResolvedValue(okResponse);
    vi.stubGlobal("fetch", fetchMock);
    const refreshFn = vi.fn();

    const ctx = { userId: "user-1", tokens: { access: "access-1", refresh: "refresh-1" } };
    const res = await fetchWithAutoRefresh(new URL("https://example.com/x"), "whoop", ctx, refreshFn);

    expect(res).toBe(okResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshFn).not.toHaveBeenCalled();
    expect(ctx.tokens).toEqual({ access: "access-1", refresh: "refresh-1" });
  });

  it("on a 401, refreshes, persists the rotated pair with athleteRef defaulted to null when ctx has none, mutates ctx.tokens, and retries once", async () => {
    const { client: admin, rows } = makeFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}) };
      return { ok: true, status: 200, statusText: "OK", json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const refreshFn = vi.fn().mockResolvedValue({
      access: "rotated-access",
      refresh: "rotated-refresh",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });

    const ctx = { userId: "user-1", tokens: { access: "access-old", refresh: "refresh-old" } };
    const res = await fetchWithAutoRefresh(new URL("https://example.com/x"), "whoop", ctx, refreshFn);

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(refreshFn).toHaveBeenCalledWith("refresh-old");
    expect(ctx.tokens).toEqual({ access: "rotated-access", refresh: "rotated-refresh" });

    const persisted = rows.get("user-1:whoop");
    expect(persisted).toMatchObject({ expires_at: "2026-09-01T00:00:00.000Z", athlete_ref: null });
  });

  it("on a 401, preserves ctx.athleteRef in the persisted row instead of nulling it out", async () => {
    const { client: admin, rows } = makeFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}) };
      return { ok: true, status: 200, statusText: "OK", json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const refreshFn = vi.fn().mockResolvedValue({
      access: "rotated-access",
      refresh: "rotated-refresh",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });

    const ctx = {
      userId: "user-1",
      tokens: { access: "access-old", refresh: "refresh-old" },
      athleteRef: "athlete-55",
    };
    await fetchWithAutoRefresh(new URL("https://example.com/x"), "strava", ctx, refreshFn);

    const persisted = rows.get("user-1:strava");
    expect(persisted).toMatchObject({ athlete_ref: "athlete-55" });
  });

  it("a second 401 after the retry is returned as-is (not-ok), not thrown — callers decide how to fail", async () => {
    const { client: admin } = makeFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const refreshFn = vi.fn().mockResolvedValue({
      access: "rotated-access",
      refresh: "rotated-refresh",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });

    const ctx = { userId: "user-1", tokens: { access: "access-old", refresh: "refresh-old" } };
    const res = await fetchWithAutoRefresh(new URL("https://example.com/x"), "whoop", ctx, refreshFn);

    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });
});
