// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
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

const { runWhoopSmoke } = await import("../../scripts/smoke-whoop");

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
