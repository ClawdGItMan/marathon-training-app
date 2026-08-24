// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeAdmin } from "../helpers/fake-admin";
import type { WhoopSmokeDeps } from "../../scripts/smoke-whoop";

/**
 * Behavioral tests for scripts/smoke-whoop.ts's `runWhoopSmoke` (Task 14).
 * `runWhoopSmoke` itself takes its dependencies as a plain object parameter
 * (no per-call mocking needed — a deliberately thin, easily-testable shape
 * for what is otherwise glue code around already-tested fetchers/
 * loadTokens). The fetchers and `loadTokens` are exercised by
 * whoop-sync.test.ts and whoop-oauth.test.ts already; these tests only
 * cover this script's own branching (env / profile / tokens / API-error /
 * success), per task-14-brief.md's "unit-test the pure/structural parts".
 *
 * `@/lib/supabase/admin` is still mocked (matching whoop-sync.test.ts's
 * precedent) even though every test below injects its own fake admin
 * client: the script module's top-level `import { getAdminClient } from
 * "@/lib/supabase/admin"` (used by its CLI-only `productionDeps()`) would
 * otherwise eagerly evaluate the real admin.ts, whose `import "server-only"`
 * throws outside Next's server-component condition.
 */

const { getAdminClientMock } = vi.hoisted(() => ({ getAdminClientMock: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));

const { runWhoopSmoke, productionDeps } = await import("../../scripts/smoke-whoop");

const FULL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  TOKEN_ENCRYPTION_KEY: "key",
  WHOOP_CLIENT_ID: "client-id",
  WHOOP_CLIENT_SECRET: "client-secret",
};

function makeDeps(overrides: Partial<WhoopSmokeDeps> = {}): WhoopSmokeDeps {
  const { client } = createFakeAdmin(["profiles"] as const);
  return {
    admin: client,
    loadTokens: vi.fn(),
    fetchWhoopRecoveries: vi.fn().mockResolvedValue([]),
    fetchWhoopSleeps: vi.fn().mockResolvedValue([]),
    fetchWhoopCycles: vi.fn().mockResolvedValue([]),
    fetchWhoopWorkouts: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("runWhoopSmoke", () => {
  it("fails fast on missing env, without touching the admin client or fetchers", async () => {
    const deps = makeDeps();
    const result = await runWhoopSmoke(deps, { NEXT_PUBLIC_SUPABASE_URL: "set" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(deps.loadTokens).not.toHaveBeenCalled();
    expect(deps.fetchWhoopRecoveries).not.toHaveBeenCalled();
  });

  it("fails with an actionable message when no profile exists yet", async () => {
    const deps = makeDeps();
    const result = await runWhoopSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/sign in once/i);
    expect(deps.loadTokens).not.toHaveBeenCalled();
  });

  it("fails with an actionable message when the profile has no stored Whoop tokens", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({ admin: client, loadTokens: vi.fn().mockResolvedValue(null) });

    const result = await runWhoopSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not connected/i);
    expect(deps.fetchWhoopRecoveries).not.toHaveBeenCalled();
  });

  it("surfaces a live API error verbatim", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({
      admin: client,
      loadTokens: vi.fn().mockResolvedValue({ access: "a", refresh: "r", expiresAt: null }),
      fetchWhoopRecoveries: vi.fn().mockRejectedValue(new Error("Whoop API request failed: 500 Internal Server Error")),
    });

    const result = await runWhoopSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Whoop API error");
    expect(result.message).toContain("500 Internal Server Error");
  });

  it("surfaces a non-Error (Postgrest-style plain-object) rejection's message, not '[object Object]'", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({
      admin: client,
      loadTokens: vi.fn().mockResolvedValue({ access: "a", refresh: "r", expiresAt: null }),
      fetchWhoopRecoveries: vi.fn().mockRejectedValue({ message: "rate limited", code: "429" }),
    });

    const result = await runWhoopSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("rate limited");
    expect(result.message).not.toContain("[object Object]");
  });

  it("reports counts on success", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({
      admin: client,
      loadTokens: vi.fn().mockResolvedValue({ access: "a", refresh: "r", expiresAt: null }),
      fetchWhoopRecoveries: vi.fn().mockResolvedValue([{}, {}]),
      fetchWhoopSleeps: vi.fn().mockResolvedValue([{}]),
      fetchWhoopCycles: vi.fn().mockResolvedValue([{}, {}, {}]),
      fetchWhoopWorkouts: vi.fn().mockResolvedValue([]),
    });

    const result = await runWhoopSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("recoveries: 2");
    expect(result.message).toContain("sleeps: 1");
    expect(result.message).toContain("cycles: 3");
    expect(result.message).toContain("workouts: 0");
  });

  it("calls fetchers sequentially with the same auth context, not concurrently", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const order: string[] = [];
    const deps = makeDeps({
      admin: client,
      loadTokens: vi.fn().mockResolvedValue({ access: "a", refresh: "r", expiresAt: null }),
      fetchWhoopRecoveries: vi.fn().mockImplementation(async () => {
        order.push("recoveries");
        return [];
      }),
      fetchWhoopSleeps: vi.fn().mockImplementation(async () => {
        order.push("sleeps");
        return [];
      }),
      fetchWhoopCycles: vi.fn().mockImplementation(async () => {
        order.push("cycles");
        return [];
      }),
      fetchWhoopWorkouts: vi.fn().mockImplementation(async () => {
        order.push("workouts");
        return [];
      }),
    });

    await runWhoopSmoke(deps, FULL_ENV);

    expect(order).toEqual(["recoveries", "sleeps", "cycles", "workouts"]);
  });
});

// ---- the "read-only for business data, MAY rotate tokens" contract ----------
// Pins the qualified claim in the script's header comment (fix loop 1): a
// smoke run whose stored access token has expired must (a) still succeed,
// (b) persist the rotated token pair to integration_tokens via the SHARED
// auto-refresh path — the crash-safe behavior, since Whoop's refresh token
// is single-use — and (c) write nothing to any business table. Runs the
// REAL fetchers + REAL loadTokens/saveTokens (real AES-256-GCM) against the
// fake admin client with only global `fetch` stubbed, mirroring
// whoop-sync.test.ts's token-rotation test setup.

describe("runWhoopSmoke token rotation (shared auto-refresh path)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getAdminClientMock.mockReset();
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.WHOOP_CLIENT_ID;
    delete process.env.WHOOP_CLIENT_SECRET;
  });

  it("succeeds on an expired access token, persists the rotated pair, and writes zero business rows", async () => {
    // Real process.env, not just runWhoopSmoke's env param: the cipher
    // (encrypt/decrypt) and the refresh request's requireEnv() both read
    // process.env directly — the env param only feeds the upfront check.
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.WHOOP_CLIENT_ID = "client-id";
    process.env.WHOOP_CLIENT_SECRET = "client-secret";

    const { encryptToken } = await import("@/lib/crypto/token-cipher");
    const oauth = await import("@/lib/integrations/oauth");
    const whoopClient = await import("@/lib/integrations/whoop/client");

    const { client, tables } = createFakeAdmin([
      "profiles",
      "integration_tokens",
      "activities",
      "recovery_snapshots",
      "planned_sessions",
      "sync_runs",
    ] as const);
    // Real saveTokens/loadTokens resolve their client via the mocked
    // getAdminClient — point it at the same fake the deps use.
    getAdminClientMock.mockReturnValue(client);

    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const encrypted = encryptToken(JSON.stringify({ access: "access-expired", refresh: "refresh-orig" }));
    tables.integration_tokens.seed({
      user_id: "user-1",
      provider: "whoop",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      expires_at: "2026-01-01T00:00:00.000Z",
      athlete_ref: null,
    });

    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    // The expired access token 401s; the refresh endpoint rotates the pair;
    // the rotated access token succeeds everywhere. Keying responses off the
    // Authorization header (not call counts) proves the retry actually
    // carries the ROTATED token, not just that a retry happened.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(input.toString());
        if (url.href === whoopClient.WHOOP_TOKEN_URL) {
          return json(200, { access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 3600 });
        }
        const auth = new Headers(init?.headers).get("Authorization");
        if (auth === "Bearer access-expired") return json(401, { error: "expired" });
        if (auth === "Bearer rotated-access") return json(200, { records: [], next_token: null });
        throw new Error(`Unexpected Authorization in smoke rotation test: ${auth}`);
      })
    );

    const result = await runWhoopSmoke(
      {
        admin: client,
        loadTokens: oauth.loadTokens,
        fetchWhoopRecoveries: whoopClient.fetchWhoopRecoveries,
        fetchWhoopSleeps: whoopClient.fetchWhoopSleeps,
        fetchWhoopCycles: whoopClient.fetchWhoopCycles,
        fetchWhoopWorkouts: whoopClient.fetchWhoopWorkouts,
      },
      FULL_ENV
    );

    // (a) a merely-expired access token is NOT a smoke failure
    expect(result.ok).toBe(true);
    expect(result.message).toContain("recoveries: 0");

    // (b) the rotated pair was persisted (single upserted row, decrypts to the new tokens)
    expect(tables.integration_tokens.rows()).toHaveLength(1);
    const persisted = await oauth.loadTokens("user-1", "whoop");
    expect(persisted).toMatchObject({ access: "rotated-access", refresh: "rotated-refresh" });

    // (c) zero business-table writes — the header's qualified read-only claim
    expect(tables.activities.rows()).toHaveLength(0);
    expect(tables.recovery_snapshots.rows()).toHaveLength(0);
    expect(tables.planned_sessions.rows()).toHaveLength(0);
    expect(tables.sync_runs.rows()).toHaveLength(0);
  });
});

describe("productionDeps", () => {
  it("wires the shared fetchers and loadTokens (the rotation-persisting path), not bespoke fetch code", async () => {
    const oauth = await import("@/lib/integrations/oauth");
    const whoopClient = await import("@/lib/integrations/whoop/client");

    const deps = productionDeps();

    expect(deps.loadTokens).toBe(oauth.loadTokens);
    expect(deps.fetchWhoopRecoveries).toBe(whoopClient.fetchWhoopRecoveries);
    expect(deps.fetchWhoopSleeps).toBe(whoopClient.fetchWhoopSleeps);
    expect(deps.fetchWhoopCycles).toBe(whoopClient.fetchWhoopCycles);
    expect(deps.fetchWhoopWorkouts).toBe(whoopClient.fetchWhoopWorkouts);
  });
});
