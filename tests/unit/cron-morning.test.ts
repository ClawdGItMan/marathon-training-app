// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for Task 9: the DST-safe morning cron
 * (src/app/api/cron/morning/route.ts), the local-hour helper added to
 * src/lib/sync/timezone.ts, the on-open staleness refresh server action
 * (src/lib/sync/run.ts), and supabaseRepo's pre-first-sync seed fallback
 * for getLatestRecovery/getRecovery7d (src/lib/data/supabase-repo.ts) with
 * its staleInfo fallback flag (src/lib/data/offline-cache.ts).
 *
 * `@vitest-environment node` (not the project default jsdom) matches
 * whoop-oauth.test.ts/whoop-sync.test.ts's precedent for NextRequest/route
 * handler tests. The repo-fallback describe block below needs
 * `localStorage` (withOfflineCache's cache layer) which node doesn't
 * provide, so it stubs a minimal in-memory implementation itself rather
 * than relying on environment globals — same "stub exactly what's needed"
 * approach as this file's fake Supabase admin/browser clients.
 *
 * `@/lib/supabase/admin`, `@/lib/supabase/server`, `@/lib/supabase/browser`,
 * and `@/lib/integrations/whoop/sync` are all mocked so these tests run
 * without the Supabase stack or real Whoop network calls — this file is
 * about cron/staleness/fallback orchestration, not Whoop sync mechanics
 * (already covered by whoop-sync.test.ts).
 */

const { getAdminClientMock, getServerClientMock, getBrowserClientMock, syncWhoopMock, syncStravaMock } = vi.hoisted(
  () => ({
    getAdminClientMock: vi.fn(),
    getServerClientMock: vi.fn(),
    getBrowserClientMock: vi.fn(),
    syncWhoopMock: vi.fn(),
    syncStravaMock: vi.fn(),
  })
);

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));
vi.mock("@/lib/supabase/server", () => ({ getServerClient: getServerClientMock }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: getBrowserClientMock }));
vi.mock("@/lib/integrations/whoop/sync", () => ({ syncWhoop: syncWhoopMock }));
vi.mock("@/lib/integrations/strava/sync", () => ({ syncStrava: syncStravaMock }));

const { localHourOf } = await import("@/lib/sync/timezone");
const { STALE_RECOVERY_MS, STALE_ACTIVITIES_MS } = await import("@/lib/sync/staleness");
const { GET: cronGet } = await import("@/app/api/cron/morning/route");
const { refreshIfStale } = await import("@/lib/sync/run");
const { supabaseRepo } = await import("@/lib/data/supabase-repo");
const { withOfflineCache, getStaleInfo, __resetStaleInfoForTests } = await import("@/lib/data/offline-cache");
const { seed } = await import("@/lib/data/seed");

// ---- tiny in-memory fakes ---------------------------------------------------

type Row = Record<string, unknown>;

/** Generic fake Supabase query builder: select/eq/order/limit/maybeSingle,
 * plus a `then` so a bare `await client.from(x).select(y)` (no terminal
 * call) resolves too, matching real supabase-js's thenable FilterBuilder. */
function makeQueryBuilder(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  // I3 harness extension: `.not(col, "is", null)` (getLatestActivity's
  // strava-sourced filter). A key absent from a fake row is a NULL column
  // on real Postgres, so undefined is excluded too.
  const notNullCols: string[] = [];
  let orderCol: string | undefined;
  let orderAsc = true;
  let limitN: number | undefined;

  function computeRows(): Row[] {
    let result = rows.filter(
      (r) =>
        filters.every(([c, v]) => r[c] === v) && notNullCols.every((c) => (r[c] ?? null) !== null)
    );
    if (orderCol) {
      const col = orderCol;
      result = [...result].sort((a, b) => {
        const av = a[col] as string;
        const bv = b[col] as string;
        if (av < bv) return orderAsc ? -1 : 1;
        if (av > bv) return orderAsc ? 1 : -1;
        return 0;
      });
    }
    if (limitN !== undefined) result = result.slice(0, limitN);
    return result;
  }

  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    not(col: string, _op: "is", val: unknown) {
      void _op;
      if (val === null) notNullCols.push(col);
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderCol = col;
      orderAsc = opts?.ascending ?? true;
      return builder;
    },
    limit(n: number) {
      limitN = n;
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: computeRows()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: computeRows(), error: null }),
  };
  return builder;
}

function makeFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

function authedRequest(secret = "test-cron-secret"): NextRequest {
  return new NextRequest("https://app.example.com/api/cron/morning", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

// ---- localHourOf ------------------------------------------------------------

describe("localHourOf", () => {
  it("returns the tz-aware wall-clock hour under EDT (summer, UTC-4)", () => {
    // 10:00 UTC on 2026-07-10 is 06:00 America/New_York (EDT, UTC-4).
    expect(localHourOf(new Date("2026-07-10T10:00:00Z"), "America/New_York")).toBe(6);
  });

  it("returns the tz-aware wall-clock hour under EST (winter, UTC-5) — proving it isn't a fixed offset", () => {
    // 11:00 UTC on 2026-01-15 is 06:00 America/New_York (EST, UTC-5).
    expect(localHourOf(new Date("2026-01-15T11:00:00Z"), "America/New_York")).toBe(6);
  });

  it("returns 0 at local midnight, not 24", () => {
    // 05:00 UTC on 2026-07-10 is 01:00 EDT the same day... use an exact
    // midnight instant instead: 04:00 UTC on 2026-07-10 is 00:00 EDT.
    expect(localHourOf(new Date("2026-07-10T04:00:00Z"), "America/New_York")).toBe(0);
  });
});

// ---- GET /api/cron/morning ---------------------------------------------------

describe("GET /api/cron/morning", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("401s without the correct bearer secret", async () => {
    const request = new NextRequest("https://app.example.com/api/cron/morning");
    const response = await cronGet(request);

    expect(response.status).toBe(401);
    expect(getAdminClientMock).not.toHaveBeenCalled();
    expect(syncWhoopMock).not.toHaveBeenCalled();
    expect(syncStravaMock).not.toHaveBeenCalled();
  });

  it("401s with a wrong bearer secret", async () => {
    const response = await cronGet(authedRequest("wrong-secret"));
    expect(response.status).toBe(401);
    expect(syncWhoopMock).not.toHaveBeenCalled();
    expect(syncStravaMock).not.toHaveBeenCalled();
  });

  it("no-ops (does not sync) when the profile's local hour is not 6", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T14:00:00Z")); // 10am ET, not 6am
    const admin = { from: () => makeQueryBuilder([{ id: "user-1", home_timezone: "America/New_York" }]) };
    getAdminClientMock.mockReturnValue(admin);

    const response = await cronGet(authedRequest());

    expect(response.status).toBe(200);
    expect(syncWhoopMock).not.toHaveBeenCalled();
    expect(syncStravaMock).not.toHaveBeenCalled();
  });

  it("runs syncWhoop then syncStrava exactly once for a profile whose local hour is exactly 6", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T10:00:00Z")); // 6am ET
    const admin = { from: () => makeQueryBuilder([{ id: "user-1", home_timezone: "America/New_York" }]) };
    getAdminClientMock.mockReturnValue(admin);
    syncWhoopMock.mockResolvedValue({ ok: true, items: 2 });
    syncStravaMock.mockResolvedValue({ ok: true, items: 1 });

    const response = await cronGet(authedRequest());

    expect(response.status).toBe(200);
    expect(syncWhoopMock).toHaveBeenCalledTimes(1);
    expect(syncWhoopMock).toHaveBeenCalledWith(admin, "user-1");
    expect(syncStravaMock).toHaveBeenCalledTimes(1);
    expect(syncStravaMock).toHaveBeenCalledWith(admin, "user-1");
    // Whoop before Strava (dedupe ordering — see route.ts's comment).
    const whoopOrder = syncWhoopMock.mock.invocationCallOrder[0];
    const stravaOrder = syncStravaMock.mock.invocationCallOrder[0];
    expect(whoopOrder).toBeLessThan(stravaOrder);
  });

  it("iterates every profile, syncing only the ones whose local hour is 6", async () => {
    vi.useFakeTimers();
    // 10:00 UTC: 6am America/New_York (EDT), but 3am America/Los_Angeles (PDT).
    vi.setSystemTime(new Date("2026-07-10T10:00:00Z"));
    const admin = {
      from: () =>
        makeQueryBuilder([
          { id: "user-et", home_timezone: "America/New_York" },
          { id: "user-pt", home_timezone: "America/Los_Angeles" },
        ]),
    };
    getAdminClientMock.mockReturnValue(admin);
    syncWhoopMock.mockResolvedValue({ ok: true, items: 0 });
    syncStravaMock.mockResolvedValue({ ok: true, items: 0 });

    const response = await cronGet(authedRequest());

    expect(response.status).toBe(200);
    expect(syncWhoopMock).toHaveBeenCalledTimes(1);
    expect(syncWhoopMock).toHaveBeenCalledWith(admin, "user-et");
    expect(syncStravaMock).toHaveBeenCalledTimes(1);
    expect(syncStravaMock).toHaveBeenCalledWith(admin, "user-et");
  });
});

// ---- refreshIfStale -----------------------------------------------------------

function mockUser(user: { id: string } | null) {
  getServerClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  });
}

describe("refreshIfStale", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns without syncing or touching the admin client when there is no authenticated user", async () => {
    mockUser(null);

    await expect(refreshIfStale()).resolves.toBeUndefined();

    expect(getAdminClientMock).not.toHaveBeenCalled();
    expect(syncWhoopMock).not.toHaveBeenCalled();
    expect(syncStravaMock).not.toHaveBeenCalled();
  });

  it("triggers a sync when the last ok sync_runs row is older than the recovery staleness threshold", async () => {
    mockUser({ id: "user-1" });
    vi.useFakeTimers();
    const now = new Date("2026-07-10T12:00:00Z");
    vi.setSystemTime(now);
    const staleRanAt = new Date(now.getTime() - STALE_RECOVERY_MS - 60_000).toISOString();
    const admin = {
      from: () =>
        makeQueryBuilder([{ user_id: "user-1", source: "whoop", ok: true, ran_at: staleRanAt }]),
    };
    getAdminClientMock.mockReturnValue(admin);
    syncWhoopMock.mockResolvedValue({ ok: true, items: 1 });
    // No "strava" row exists in this fixture either -> strava is also
    // "never synced" -> also triggers, independently of whoop.
    syncStravaMock.mockResolvedValue({ ok: true, items: 0 });

    await refreshIfStale();

    expect(syncWhoopMock).toHaveBeenCalledTimes(1);
    expect(syncWhoopMock).toHaveBeenCalledWith(admin, "user-1");
  });

  it("skips the sync when the last ok sync_runs row is within the staleness threshold", async () => {
    mockUser({ id: "user-1" });
    vi.useFakeTimers();
    const now = new Date("2026-07-10T12:00:00Z");
    vi.setSystemTime(now);
    const freshRanAt = new Date(now.getTime() - 60_000).toISOString(); // 1 minute ago
    const admin = {
      from: () =>
        makeQueryBuilder([
          { user_id: "user-1", source: "whoop", ok: true, ran_at: freshRanAt },
          { user_id: "user-1", source: "strava", ok: true, ran_at: freshRanAt },
        ]),
    };
    getAdminClientMock.mockReturnValue(admin);

    await refreshIfStale();

    expect(syncWhoopMock).not.toHaveBeenCalled();
    expect(syncStravaMock).not.toHaveBeenCalled();
  });

  it("triggers a sync when there is no prior sync_runs row at all (never synced)", async () => {
    mockUser({ id: "user-1" });
    const admin = { from: () => makeQueryBuilder([]) };
    getAdminClientMock.mockReturnValue(admin);
    syncWhoopMock.mockResolvedValue({ ok: true, items: 1 });
    syncStravaMock.mockResolvedValue({ ok: true, items: 1 });

    await refreshIfStale();

    expect(syncWhoopMock).toHaveBeenCalledTimes(1);
    expect(syncStravaMock).toHaveBeenCalledTimes(1);
  });

  it("triggers syncStrava independently (STALE_ACTIVITIES_MS, 1h) when whoop is still fresh", async () => {
    mockUser({ id: "user-1" });
    vi.useFakeTimers();
    const now = new Date("2026-07-10T12:00:00Z");
    vi.setSystemTime(now);
    const freshWhoop = new Date(now.getTime() - 60_000).toISOString();
    const staleStrava = new Date(now.getTime() - STALE_ACTIVITIES_MS - 60_000).toISOString();
    const admin = {
      from: () =>
        makeQueryBuilder([
          { user_id: "user-1", source: "whoop", ok: true, ran_at: freshWhoop },
          { user_id: "user-1", source: "strava", ok: true, ran_at: staleStrava },
        ]),
    };
    getAdminClientMock.mockReturnValue(admin);
    syncStravaMock.mockResolvedValue({ ok: true, items: 1 });

    await refreshIfStale();

    expect(syncWhoopMock).not.toHaveBeenCalled();
    expect(syncStravaMock).toHaveBeenCalledTimes(1);
    expect(syncStravaMock).toHaveBeenCalledWith(admin, "user-1");
  });

  it("swallows a whoop sync failure, resolves void, and still attempts strava independently", async () => {
    mockUser({ id: "user-1" });
    const admin = { from: () => makeQueryBuilder([]) };
    getAdminClientMock.mockReturnValue(admin);
    syncWhoopMock.mockRejectedValue(new Error("whoop is down"));
    syncStravaMock.mockResolvedValue({ ok: true, items: 0 });

    await expect(refreshIfStale()).resolves.toBeUndefined();

    expect(syncStravaMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a strava sync failure and resolves void rather than throwing", async () => {
    mockUser({ id: "user-1" });
    const admin = { from: () => makeQueryBuilder([]) };
    getAdminClientMock.mockReturnValue(admin);
    syncWhoopMock.mockResolvedValue({ ok: true, items: 0 });
    syncStravaMock.mockRejectedValue(new Error("strava is down"));

    await expect(refreshIfStale()).resolves.toBeUndefined();
  });
});

// ---- supabaseRepo recovery fallback --------------------------------------------

describe("supabaseRepo recovery fallback (pre-first-sync)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    __resetStaleInfoForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("getLatestRecovery falls back to the seed's latest snapshot when recovery_snapshots has no rows", async () => {
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([]) });

    const result = await supabaseRepo.getLatestRecovery();

    expect(result).toEqual(seed.recovery.at(-1));
  });

  it("getRecovery7d falls back to the seed's last 7 snapshots when recovery_snapshots has no rows", async () => {
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([]) });

    const result = await supabaseRepo.getRecovery7d();

    expect(result).toEqual(seed.recovery.slice(-7));
  });

  it("marks the fallback flag in staleInfo (via withOfflineCache) when getLatestRecovery falls back to seed data", async () => {
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([]) });
    const cached = withOfflineCache(supabaseRepo);

    await cached.getLatestRecovery();

    expect(getStaleInfo().getLatestRecovery).toMatchObject({ fallback: true });
  });

  it("marks the fallback flag in staleInfo (via withOfflineCache) when getRecovery7d falls back to seed data", async () => {
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([]) });
    const cached = withOfflineCache(supabaseRepo);

    await cached.getRecovery7d();

    expect(getStaleInfo().getRecovery7d).toMatchObject({ fallback: true });
  });

  it("does NOT set the fallback flag when recovery_snapshots has real rows (normal path unaffected)", async () => {
    const row = {
      day: "2026-07-09",
      recovery_pct: 67,
      hrv_ms: 54.3,
      rhr: 48,
      day_strain: 14.2,
      sleep: {
        respRate: 15.2,
        durationMin: 442,
        needMin: 490,
        efficiencyPct: 88,
        sleepScorePct: 78,
        deepMin: 90,
        remMin: 142,
        lightMin: 210,
      },
      payload: { recoveryDelta: 0, hrvDeltaPct: 0, rhrDelta: 0, loadLabel: "elevated" },
    };
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([row]) });
    const cached = withOfflineCache(supabaseRepo);

    const result = await cached.getLatestRecovery();

    expect(result.date).toBe("2026-07-09");
    expect(getStaleInfo().getLatestRecovery).toEqual({ servedFromCache: false, cachedAt: expect.any(String) });
  });
});

// ---- supabaseRepo activity/mileage fallback (Task 11) -----------------------

describe("supabaseRepo activity/mileage fallback (pre-first-import, Task 11)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    __resetStaleInfoForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("getLatestActivity falls back to the seed's latest activity when activities has no rows", async () => {
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([]) });

    const result = await supabaseRepo.getLatestActivity();

    expect(result).toEqual(seed.activities.at(-1));
  });

  it("getLatestActivity returns the real row (mapped via rowToActivity) when one exists", async () => {
    // strava_id present: as of I3 the card reads STRAVA-SOURCED rows only —
    // a whoop-only row here would (correctly) fall back to seed instead.
    const row = {
      id: "activity-1",
      strava_id: 987654321,
      started_at: "2026-07-09T13:02:00.000Z",
      distance_m: 8046.72, // 5.0mi
      moving_sec: 1800,
      avg_pace_sec_per_mi: 360,
      payload: { title: "Evening Shakeout" },
    };
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([row]) });

    const result = await supabaseRepo.getLatestActivity();

    expect(result).toEqual({
      id: "activity-1",
      date: "2026-07-09",
      title: "Evening Shakeout",
      distanceMi: 5,
      timeSec: 1800,
      paceSecPerMi: 360,
      synced: true,
    });
  });

  it("marks the fallback flag in staleInfo when getLatestActivity falls back to seed data", async () => {
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([]) });
    const cached = withOfflineCache(supabaseRepo);

    await cached.getLatestActivity();

    expect(getStaleInfo().getLatestActivity).toMatchObject({ fallback: true });
  });

  it("getMileage12wk falls back to the seed's mileage array when no activities exist", async () => {
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([]) });

    const result = await supabaseRepo.getMileage12wk();

    expect(result).toEqual(seed.mileage12wk);
  });

  it("getMileage12wk falls back when the only rows present are non-run-equivalent sports", async () => {
    const rows = [{ started_at: "2026-07-09T13:00:00.000Z", distance_m: 20000, sport: "Ride" }];
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder(rows) });

    const result = await supabaseRepo.getMileage12wk();

    expect(result).toEqual(seed.mileage12wk);
  });

  it("getMileage12wk computes real weekly sums (miles, oldest-first, length 12) once run activities exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00Z")); // Friday; this week's Monday is 2026-07-06
    const rows = [
      { started_at: "2026-07-09T13:00:00.000Z", distance_m: 8046.72, sport: "Run" }, // 5.0mi, Thu
      { started_at: "2026-07-08T13:00:00.000Z", distance_m: 1609.344, sport: "Run" }, // 1.0mi, Wed
    ];
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder(rows) });

    const result = await supabaseRepo.getMileage12wk();

    expect(result).toHaveLength(12);
    expect(result.at(-1)).toBe(6); // this week's bucket: 5.0 + 1.0, rounded
    expect(result.slice(0, 11).every((n) => n === 0)).toBe(true);
  });

  it("marks the fallback flag in staleInfo when getMileage12wk falls back to seed data", async () => {
    getBrowserClientMock.mockReturnValue({ from: () => makeQueryBuilder([]) });
    const cached = withOfflineCache(supabaseRepo);

    await cached.getMileage12wk();

    expect(getStaleInfo().getMileage12wk).toMatchObject({ fallback: true });
  });
});
