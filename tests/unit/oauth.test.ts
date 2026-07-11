// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/crypto/token-cipher";

/**
 * Behavioral tests for src/lib/integrations/oauth.ts — the shared CSRF-state
 * cookie helpers and the encrypted token store used by both the Whoop and
 * Strava connect/callback routes (Tasks 7/10).
 *
 * `@/lib/supabase/server` and `@/lib/supabase/admin` are mocked so this file
 * runs without the Supabase stack or real cookies; `next/headers` is mocked
 * for the same reason (`makeState` sets a real httpOnly cookie in
 * production). `token-cipher` is NOT mocked — saveTokens/loadTokens are
 * exercised against the real AES-256-GCM implementation so the tests prove
 * actual encryption/decryption happens, not just that the right functions
 * were called.
 */

const { cookiesMock, getServerClientMock, getAdminClientMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getServerClientMock: vi.fn(),
  getAdminClientMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/supabase/server", () => ({ getServerClient: getServerClientMock }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));

const { assertState, loadTokens, makeState, OAUTH_STATE_COOKIE, saveTokens } = await import(
  "@/lib/integrations/oauth"
);

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

function mockAuthedUser(userId: string | null) {
  getServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue(
        userId
          ? { data: { user: { id: userId } }, error: null }
          : { data: { user: null }, error: null }
      ),
    },
  });
}

describe("assertState", () => {
  it("does not throw when the cookie value matches the query param", () => {
    expect(() => assertState("abc123", "abc123")).not.toThrow();
  });

  it("throws when the cookie value and query param mismatch", () => {
    expect(() => assertState("abc123", "different")).toThrow();
  });

  it("throws when the cookie value is missing", () => {
    expect(() => assertState(undefined, "abc123")).toThrow();
    expect(() => assertState(null, "abc123")).toThrow();
  });

  it("throws when the query param is missing", () => {
    expect(() => assertState("abc123", undefined)).toThrow();
    expect(() => assertState("abc123", null)).toThrow();
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

  it("saveTokens upserts encrypted fields (never the plaintext tokens) via the admin client", async () => {
    mockAuthedUser("user-123");
    const admin = makeAdminClientMock({});
    getAdminClientMock.mockReturnValue(admin);

    await saveTokens("whoop", {
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

  it("loadTokens decrypts the stored row back into the original access/refresh tokens", async () => {
    mockAuthedUser("user-123");
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

    const result = await loadTokens("strava");

    expect(admin.from).toHaveBeenCalledWith("integration_tokens");
    expect(result).toEqual({
      access: "a-tok",
      refresh: "r-tok",
      expiresAt: "2026-08-01T00:00:00.000Z",
      athleteRef: "athlete-42",
    });
  });

  it("loadTokens returns null when no row exists for the user/provider", async () => {
    mockAuthedUser("user-123");
    const admin = makeAdminClientMock({ selectResult: { data: null, error: null } });
    getAdminClientMock.mockReturnValue(admin);

    expect(await loadTokens("whoop")).toBeNull();
  });

  it("saveTokens throws when there is no authenticated user in session", async () => {
    mockAuthedUser(null);
    getAdminClientMock.mockReturnValue(makeAdminClientMock({}));

    await expect(
      saveTokens("whoop", {
        access: "a",
        refresh: "r",
        expiresAt: null,
        athleteRef: null,
      })
    ).rejects.toThrow();
  });
});
