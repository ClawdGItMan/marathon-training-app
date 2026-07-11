// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createFakeAdmin } from "../helpers/fake-admin";
import type { StravaSmokeDeps } from "../../scripts/smoke-strava";

/**
 * Behavioral tests for scripts/smoke-strava.ts's `runStravaSmoke` (Task 14).
 * Mirrors tests/unit/smoke-whoop.test.ts's structure/rationale exactly —
 * see that file for why `@/lib/supabase/admin` is mocked even though every
 * test injects its own fake admin client.
 */

const { getAdminClientMock } = vi.hoisted(() => ({ getAdminClientMock: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));

const { runStravaSmoke, productionDeps } = await import("../../scripts/smoke-strava");

const FULL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  TOKEN_ENCRYPTION_KEY: "key",
  STRAVA_CLIENT_ID: "client-id",
  STRAVA_CLIENT_SECRET: "client-secret",
};

function makeDeps(overrides: Partial<StravaSmokeDeps> = {}): StravaSmokeDeps {
  const { client } = createFakeAdmin(["profiles"] as const);
  return {
    admin: client,
    loadTokens: vi.fn(),
    listActivities: vi.fn().mockResolvedValue([]),
    getActivity: vi.fn(),
    ...overrides,
  };
}

describe("runStravaSmoke", () => {
  it("fails fast on missing env, without touching the admin client or fetchers", async () => {
    const deps = makeDeps();
    const result = await runStravaSmoke(deps, { NEXT_PUBLIC_SUPABASE_URL: "set" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(deps.loadTokens).not.toHaveBeenCalled();
    expect(deps.listActivities).not.toHaveBeenCalled();
  });

  it("fails with an actionable message when no profile exists yet", async () => {
    const deps = makeDeps();
    const result = await runStravaSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/sign in once/i);
    expect(deps.loadTokens).not.toHaveBeenCalled();
  });

  it("fails with an actionable message when the profile has no stored Strava tokens", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({ admin: client, loadTokens: vi.fn().mockResolvedValue(null) });

    const result = await runStravaSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not connected/i);
    expect(deps.listActivities).not.toHaveBeenCalled();
  });

  it("surfaces a live API error verbatim", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({
      admin: client,
      loadTokens: vi.fn().mockResolvedValue({ access: "a", refresh: "r", expiresAt: null, athleteRef: "9" }),
      listActivities: vi.fn().mockRejectedValue(new Error("Strava API request failed: 401 Unauthorized")),
    });

    const result = await runStravaSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Strava API error");
    expect(result.message).toContain("401 Unauthorized");
  });

  it("surfaces a non-Error (Postgrest-style plain-object) rejection's message, not '[object Object]'", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({
      admin: client,
      loadTokens: vi.fn().mockResolvedValue({ access: "a", refresh: "r", expiresAt: null, athleteRef: "9" }),
      listActivities: vi.fn().mockRejectedValue({ message: "rate limited", code: "429" }),
    });

    const result = await runStravaSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("rate limited");
    expect(result.message).not.toContain("[object Object]");
  });

  it("reports zero activities as success without calling getActivity", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({
      admin: client,
      loadTokens: vi.fn().mockResolvedValue({ access: "a", refresh: "r", expiresAt: null, athleteRef: "9" }),
      listActivities: vi.fn().mockResolvedValue([]),
    });

    const result = await runStravaSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("activities: 0");
    expect(deps.getActivity).not.toHaveBeenCalled();
  });

  it("on a nonempty window, also smokes getActivity for the first activity", async () => {
    const { client, tables } = createFakeAdmin(["profiles"] as const);
    tables.profiles.seed({ id: "user-1", created_at: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps({
      admin: client,
      loadTokens: vi.fn().mockResolvedValue({ access: "a", refresh: "r", expiresAt: null, athleteRef: "9" }),
      listActivities: vi.fn().mockResolvedValue([{ id: 42, name: "Morning Run" }, { id: 43, name: "Evening Run" }]),
      getActivity: vi.fn().mockResolvedValue({ id: 42, name: "Morning Run" }),
    });

    const result = await runStravaSmoke(deps, FULL_ENV);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("activities: 2");
    expect(result.message).toContain("getActivity(42)");
    expect(deps.getActivity).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), 42);
  });
});

describe("productionDeps", () => {
  it("wires the shared fetchers and loadTokens (the rotation-persisting path), not bespoke fetch code", async () => {
    // Structural pin for the header's "read-only for business data, MAY
    // rotate tokens" contract — the qualified claim only holds while the
    // CLI wiring stays on the shared fetchers whose 401-refresh persists a
    // rotated token pair via oauth.ts's fetchWithAutoRefresh. The rotation
    // behavior itself is pinned once, behaviorally, in smoke-whoop.test.ts
    // (the path is the same shared function for both providers).
    const oauth = await import("@/lib/integrations/oauth");
    const stravaClient = await import("@/lib/integrations/strava/client");

    const deps = productionDeps();

    expect(deps.loadTokens).toBe(oauth.loadTokens);
    expect(deps.listActivities).toBe(stravaClient.listActivities);
    expect(deps.getActivity).toBe(stravaClient.getActivity);
  });
});
