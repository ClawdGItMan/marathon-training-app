// @vitest-environment node
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/crypto/token-cipher";
import recoveryFixture from "../fixtures/whoop/recovery.json";
import sleepFixture from "../fixtures/whoop/sleep.json";
import cycleFixture from "../fixtures/whoop/cycle.json";
import workoutFixture from "../fixtures/whoop/workout.json";

/**
 * Behavioral tests for Task 8: the Whoop data fetchers (added to
 * src/lib/integrations/whoop/client.ts), the wire schemas
 * (src/lib/integrations/whoop/wire.ts), the sync orchestrator
 * (src/lib/integrations/whoop/sync.ts), and the timezone helper
 * (src/lib/sync/timezone.ts).
 *
 * `@/lib/supabase/admin` is mocked so this runs without the Supabase stack.
 * Unlike the fluent per-call mocks in oauth.test.ts/whoop-oauth.test.ts,
 * this file backs `getAdminClient()` with a small in-memory fake that
 * actually implements upsert/insert/select semantics (onConflict,
 * ignoreDuplicates) over real JS Maps/arrays — needed to prove idempotency
 * (second sync doesn't duplicate rows) and token-rotation persistence
 * behaviorally, not by asserting a mock was "called with" the right args.
 * `@/lib/integrations/oauth` is NOT mocked — saveTokens/loadTokens run for
 * real (real AES-256-GCM) against the fake admin client, same approach as
 * whoop-oauth.test.ts.
 */

const { getAdminClientMock } = vi.hoisted(() => ({
  getAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));

const { localDayOf } = await import("@/lib/sync/timezone");
const { STALE_RECOVERY_MS, STALE_ACTIVITIES_MS } = await import("@/lib/sync/staleness");
const { WHOOP_TOKEN_URL } = await import("@/lib/integrations/whoop/client");
const { syncWhoop } = await import("@/lib/integrations/whoop/sync");
const { saveTokens } = await import("@/lib/integrations/oauth");

function testKey(): string {
  return randomBytes(32).toString("base64");
}

// ---- in-memory fake Supabase admin client ----------------------------------
// Implements exactly the chains this task's code paths use: .select().eq()
// [.eq()].maybeSingle(), .upsert(rows, {onConflict, ignoreDuplicates}), and
// .insert(row). Upsert honors onConflict (match key) and ignoreDuplicates
// (skip instead of overwrite on a match) for real, so "second sync doesn't
// duplicate" is proven by row counts, not by inspecting call arguments.

type Row = Record<string, unknown>;

function makeTable() {
  const rows: Row[] = [];
  return {
    rows: () => rows,
    seed(row: Row) {
      rows.push({ ...row });
    },
    insert(payload: Row | Row[]) {
      const incoming = Array.isArray(payload) ? payload : [payload];
      rows.push(...incoming.map((r) => ({ ...r })));
    },
    upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      const incoming = Array.isArray(payload) ? payload : [payload];
      const keyCols = opts?.onConflict?.split(",") ?? [];
      for (const nr of incoming) {
        const idx = rows.findIndex((r) => keyCols.every((c) => r[c] === nr[c]));
        if (idx >= 0) {
          if (!opts?.ignoreDuplicates) rows[idx] = { ...rows[idx], ...nr };
        } else {
          rows.push({ ...nr });
        }
      }
    },
  };
}

function makeQueryBuilder(table: ReturnType<typeof makeTable>) {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    maybeSingle: () =>
      Promise.resolve({
        data: table.rows().find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
        error: null,
      }),
    upsert: (payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      table.upsert(payload, opts);
      return Promise.resolve({ error: null });
    },
    insert: (payload: Row | Row[]) => {
      table.insert(payload);
      return Promise.resolve({ error: null });
    },
  };
  return builder;
}

function createFakeAdmin() {
  const tables = {
    profiles: makeTable(),
    integration_tokens: makeTable(),
    recovery_snapshots: makeTable(),
    activities: makeTable(),
    sync_runs: makeTable(),
  };
  const client = {
    from: (name: keyof typeof tables) => makeQueryBuilder(tables[name]),
  };
  // Only the `.from()` chains this task's code actually calls are
  // implemented — cast to SupabaseClient at the boundary so syncWhoop's
  // real (non-test) signature doesn't need a test-only widened type.
  return { client: client as unknown as SupabaseClient, tables };
}

// ---- fetch mock --------------------------------------------------------------

type Fixtures = {
  recovery?: unknown;
  sleep?: unknown;
  cycle?: unknown;
  workout?: unknown;
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "mock-status",
    json: async () => body,
  };
}

/**
 * `override(url, callNumberForThisPath)` lets a test force a specific
 * response (e.g. a one-time 401) for a specific endpoint/call; returning
 * undefined falls through to the default fixture response.
 */
function installWhoopFetchMock(
  fixtures: Fixtures,
  override?: (url: URL, callNumber: number) => { status: number; body: unknown } | undefined
) {
  const callCounts = new Map<string, number>();
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    void init;
    const url = new URL(input.toString());
    const n = (callCounts.get(url.pathname) ?? 0) + 1;
    callCounts.set(url.pathname, n);

    const forced = override?.(url, n);
    if (forced) return jsonResponse(forced.status, forced.body);

    if (url.href === WHOOP_TOKEN_URL) {
      return jsonResponse(200, {
        access_token: "rotated-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
      });
    }
    if (url.pathname.endsWith("/recovery")) return jsonResponse(200, fixtures.recovery);
    if (url.pathname.endsWith("/activity/sleep")) return jsonResponse(200, fixtures.sleep);
    if (url.pathname.endsWith("/cycle")) return jsonResponse(200, fixtures.cycle);
    if (url.pathname.endsWith("/activity/workout")) return jsonResponse(200, fixtures.workout);
    throw new Error(`Unhandled URL in whoop-sync test fetch mock: ${url.href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, callCounts };
}

async function seedConnectedUser(tables: ReturnType<typeof createFakeAdmin>["tables"], userId: string) {
  tables.profiles.seed({ id: userId, home_timezone: "America/New_York" });
  const encrypted = encryptToken(JSON.stringify({ access: "access-orig", refresh: "refresh-orig" }));
  tables.integration_tokens.seed({
    user_id: userId,
    provider: "whoop",
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    expires_at: "2026-07-09T00:00:00.000Z",
    athlete_ref: null,
  });
}

describe("localDayOf", () => {
  it("attributes a fall-DST-transition instant to the correct local day (America/New_York)", () => {
    // DST ends (fall back) at 2am ET on 2026-11-01; this instant is still
    // EDT (UTC-4), so it lands on 2026-11-01 local, not the UTC calendar day.
    expect(localDayOf(new Date("2026-11-02T04:30:00Z"), "America/New_York")).toBe("2026-11-01");
  });

  it("attributes instants either side of the spring-forward transition to the correct local day", () => {
    // DST begins (spring forward, 2am -> 3am ET) at 07:00 UTC on 2026-03-08.
    // Just before the jump, ET is still EST (UTC-5): 04:30 UTC is 2026-03-07
    // local. Just after, ET is EDT (UTC-4): 08:00 UTC is 2026-03-08 local.
    expect(localDayOf(new Date("2026-03-08T04:30:00Z"), "America/New_York")).toBe("2026-03-07");
    expect(localDayOf(new Date("2026-03-08T08:00:00Z"), "America/New_York")).toBe("2026-03-08");
  });
});

describe("staleness constants", () => {
  it("exports the exact thresholds from p2-globals.md", () => {
    expect(STALE_RECOVERY_MS).toBe(3 * 3600e3);
    expect(STALE_ACTIVITIES_MS).toBe(3600e3);
  });
});

describe("syncWhoop", () => {
  const userId = "user-42";

  beforeEach(() => {
    vi.stubEnv("WHOOP_CLIENT_ID", "client-abc");
    vi.stubEnv("WHOOP_CLIENT_SECRET", "secret-xyz");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", testKey());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("happy path: writes a recovery snapshot with 88/78 distinct efficiencyPct/sleepScorePct and a scored workout, then an ok sync_runs row", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    await seedConnectedUser(tables, userId);
    installWhoopFetchMock({
      recovery: recoveryFixture,
      sleep: sleepFixture,
      cycle: cycleFixture,
      workout: workoutFixture,
    });

    const result = await syncWhoop(admin, userId, {});

    expect(result.ok).toBe(true);
    expect(result.items).toBeGreaterThan(0);

    expect(tables.recovery_snapshots.rows()).toHaveLength(1);
    const snapshot = tables.recovery_snapshots.rows()[0];
    expect(snapshot.user_id).toBe(userId);
    expect(snapshot.day).toBe("2026-07-09");
    expect(snapshot.recovery_pct).toBe(67);
    expect(snapshot.hrv_ms).toBe(54.3);
    expect(snapshot.rhr).toBe(48);
    expect(snapshot.day_strain).toBe(14.2);

    const sleep = snapshot.sleep as Record<string, number>;
    expect(sleep.efficiencyPct).toBe(88);
    expect(sleep.sleepScorePct).toBe(78);
    expect(sleep.efficiencyPct).not.toBe(sleep.sleepScorePct);
    expect(sleep.deepSec).toBe(5400);
    expect(sleep.remSec).toBe(8520);
    expect(sleep.lightSec).toBe(12600);
    expect(sleep.durationSec).toBe(5400 + 8520 + 12600);

    expect(tables.activities.rows()).toHaveLength(1);
    const activity = tables.activities.rows()[0];
    expect(activity.whoop_id).toBe("e5b12a3f-2222-4b8b-9f3a-8e2d6c9a1234");
    expect(activity.sport).toBe("running");
    expect(activity.strain).toBe(11.8);
    expect(activity.avg_hr).toBe(152);
    expect(activity.max_hr).toBe(178);
    expect(activity.hr_zones).toMatchObject({ zone_two_milli: 900000 });

    expect(tables.sync_runs.rows()).toHaveLength(1);
    expect(tables.sync_runs.rows()[0]).toMatchObject({ user_id: userId, source: "whoop", ok: true });
  });

  it("a 401 on one data endpoint refreshes, PERSISTS the rotated tokens, retries once, and succeeds", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    await seedConnectedUser(tables, userId);
    const { fetchMock } = installWhoopFetchMock(
      { recovery: recoveryFixture, sleep: sleepFixture, cycle: cycleFixture, workout: workoutFixture },
      (url, n) => {
        if (url.pathname.endsWith("/recovery") && n === 1) {
          return { status: 401, body: { error: "invalid_token" } };
        }
        return undefined;
      }
    );

    const result = await syncWhoop(admin, userId, {});

    expect(result.ok).toBe(true);

    // Exactly one token-refresh round trip happened.
    const tokenCalls = fetchMock.mock.calls.filter(([input]) => String(input) === WHOOP_TOKEN_URL);
    expect(tokenCalls).toHaveLength(1);

    // /recovery was hit twice (401, then the retry) — every other endpoint
    // once, and the retry + all subsequent calls used the ROTATED token.
    const recoveryCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/recovery"));
    expect(recoveryCalls).toHaveLength(2);
    const retryHeaders = recoveryCalls[1][1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer rotated-access");

    // The rotated pair was persisted to the token store BEFORE/alongside the
    // retry — read it back independently via loadTokens against the same
    // fake admin the mocked getAdminClient() resolves to.
    const { loadTokens } = await import("@/lib/integrations/oauth");
    const stored = await loadTokens(userId, "whoop");
    expect(stored).toEqual({
      access: "rotated-access",
      refresh: "rotated-refresh",
      expiresAt: expect.any(String),
      athleteRef: null,
    });
  });

  it("a second sync of identical data does not duplicate the activity row and upserts (not duplicates) the recovery snapshot", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    await seedConnectedUser(tables, userId);
    installWhoopFetchMock({
      recovery: recoveryFixture,
      sleep: sleepFixture,
      cycle: cycleFixture,
      workout: workoutFixture,
    });

    const first = await syncWhoop(admin, userId, {});
    expect(first.ok).toBe(true);

    installWhoopFetchMock({
      recovery: recoveryFixture,
      sleep: sleepFixture,
      cycle: cycleFixture,
      workout: workoutFixture,
    });
    const second = await syncWhoop(admin, userId, {});
    expect(second.ok).toBe(true);

    expect(tables.activities.rows()).toHaveLength(1);
    expect(tables.recovery_snapshots.rows()).toHaveLength(1);
    expect(tables.sync_runs.rows()).toHaveLength(2);
  });

  it("an API error on a data endpoint returns {ok:false} with a detail message and still writes a sync_runs row", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    await seedConnectedUser(tables, userId);
    installWhoopFetchMock(
      { recovery: recoveryFixture, sleep: sleepFixture, cycle: cycleFixture, workout: workoutFixture },
      (url) => (url.pathname.endsWith("/cycle") ? { status: 500, body: { error: "server_error" } } : undefined)
    );

    const result = await syncWhoop(admin, userId, {});

    expect(result.ok).toBe(false);
    expect(result.detail).toBeTruthy();
    expect(tables.recovery_snapshots.rows()).toHaveLength(0);
    expect(tables.activities.rows()).toHaveLength(0);
    expect(tables.sync_runs.rows()).toHaveLength(1);
    expect(tables.sync_runs.rows()[0]).toMatchObject({ user_id: userId, source: "whoop", ok: false });
    expect(tables.sync_runs.rows()[0].detail).toBe(result.detail);
  });

  it("returns {ok:false} without hitting the network when Whoop isn't connected for this user", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    tables.profiles.seed({ id: userId, home_timezone: "America/New_York" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncWhoop(admin, userId, {});

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tables.sync_runs.rows()).toHaveLength(1);
    expect(tables.sync_runs.rows()[0]).toMatchObject({ ok: false });
  });

  it("follows pagination across multiple pages of a collection and aggregates all records", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    await seedConnectedUser(tables, userId);

    const page1 = { records: [], next_token: "page-2-token" };
    const page2 = recoveryFixture;
    const { fetchMock } = installWhoopFetchMock(
      { recovery: page1, sleep: sleepFixture, cycle: cycleFixture, workout: workoutFixture },
      (url, n) => {
        if (url.pathname.endsWith("/recovery") && n === 2) {
          expect(url.searchParams.get("nextToken")).toBe("page-2-token");
          return { status: 200, body: page2 };
        }
        return undefined;
      }
    );

    const result = await syncWhoop(admin, userId, {});

    expect(result.ok).toBe(true);
    const recoveryCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/recovery"));
    expect(recoveryCalls).toHaveLength(2);
    // Page 1 was empty; page 2's single scored record was still synced —
    // proving both pages' records were aggregated, not just the first page.
    expect(tables.recovery_snapshots.rows()).toHaveLength(1);
  });

  it("saveTokens/loadTokens round-trip works against the fake admin (sanity check for the test harness itself)", async () => {
    const { client: admin } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);

    await saveTokens(userId, "whoop", {
      access: "a",
      refresh: "b",
      expiresAt: "2026-08-01T00:00:00.000Z",
      athleteRef: null,
    });
    const { loadTokens } = await import("@/lib/integrations/oauth");
    expect(await loadTokens(userId, "whoop")).toEqual({
      access: "a",
      refresh: "b",
      expiresAt: "2026-08-01T00:00:00.000Z",
      athleteRef: null,
    });
  });
});
