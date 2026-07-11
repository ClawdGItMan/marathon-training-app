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
const { syncWhoop, loadLabelFor, ELEVATED_DAY_STRAIN_THRESHOLD } = await import(
  "@/lib/integrations/whoop/sync"
);
const { saveTokens } = await import("@/lib/integrations/oauth");
const { rowToRecovery } = await import("@/lib/data/row-mappers");

function testKey(): string {
  return randomBytes(32).toString("base64");
}

// ---- in-memory fake Supabase admin client ----------------------------------
// Implements exactly the chains this file's code paths use: .select().eq()
// [.eq()/.is()/.not()][.maybeSingle() | await-as-list], .upsert(rows,
// {onConflict, ignoreDuplicates})[.select()], and .insert(row). Upsert
// honors onConflict (match key) and ignoreDuplicates (skip instead of
// overwrite on a match) for real, so "second sync doesn't duplicate" is
// proven by row counts, not by inspecting call arguments.
//
// Fix-loop-1 HARNESS extensions (the test cases below are unchanged):
// upsert now returns the rows it actually INSERTED (mirroring Postgres's
// ON CONFLICT DO NOTHING ... RETURNING, which omits skipped duplicates)
// and generates row ids like the DB's uuid default, because syncWhoop's
// reverse dedupe trigger consumes `.upsert(...).select()`; the builder
// grew `.is()`/`.not()` filters, an await-as-list `then`, and
// update/delete chains for dedupeStrava's candidate query + merge path.

type Row = Record<string, unknown>;
type FakeFilter = ["eq" | "is" | "not-is", string, unknown];

function rowMatches(row: Row, filters: FakeFilter[]): boolean {
  return filters.every(([kind, col, val]) => {
    // Missing key == NULL column on real Postgres (see tests/helpers/
    // fake-admin.ts's matches() for the full rationale).
    const cell = row[col] === undefined ? null : row[col];
    return kind === "not-is" ? cell !== val : cell === val;
  });
}

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
    upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): Row[] {
      const incoming = Array.isArray(payload) ? payload : [payload];
      const keyCols = opts?.onConflict?.split(",") ?? [];
      const inserted: Row[] = [];
      for (const nr of incoming) {
        const idx = rows.findIndex((r) => keyCols.every((c) => r[c] === nr[c]));
        if (idx >= 0) {
          if (!opts?.ignoreDuplicates) rows[idx] = { ...rows[idx], ...nr };
        } else {
          const row = { id: nr.id ?? globalThis.crypto.randomUUID(), ...nr };
          rows.push(row);
          inserted.push(row);
        }
      }
      return inserted;
    },
    update(patch: Row, filters: FakeFilter[]) {
      rows.filter((r) => rowMatches(r, filters)).forEach((r) => Object.assign(r, patch));
    },
    delete(filters: FakeFilter[]) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rowMatches(rows[i], filters)) rows.splice(i, 1);
      }
    },
  };
}

function makeQueryBuilder(table: ReturnType<typeof makeTable>) {
  const filters: FakeFilter[] = [];
  const matching = () => table.rows().filter((r) => rowMatches(r, filters));
  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push(["eq", col, val]);
      return builder;
    },
    is(col: string, val: unknown) {
      filters.push(["is", col, val]);
      return builder;
    },
    not(col: string, _op: "is", val: unknown) {
      void _op;
      filters.push(["not-is", col, val]);
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => void) =>
      resolve({ data: matching(), error: null }),
    upsert: (payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      const inserted = table.upsert(payload, opts);
      // Thenable AND .select()-able, like real supabase-js: a bare
      // `await ...upsert(...)` resolves {error} (recovery_snapshots path),
      // while `...upsert(...).select()` resolves the inserted rows
      // (activities path).
      return {
        select: () => Promise.resolve({ data: inserted, error: null }),
        then: (resolve: (v: { data: null; error: null }) => void) =>
          resolve({ data: null, error: null }),
      };
    },
    insert: (payload: Row | Row[]) => {
      table.insert(payload);
      return Promise.resolve({ error: null });
    },
    update: (patch: Row) => ({
      eq: (col: string, val: unknown) => {
        table.update(patch, [["eq", col, val]]);
        return Promise.resolve({ error: null });
      },
    }),
    delete: () => ({
      eq: (col: string, val: unknown) => {
        table.delete([["eq", col, val]]);
        return Promise.resolve({ error: null });
      },
    }),
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

describe("loadLabelFor", () => {
  it("maps day strain to the seed's binary moderate/elevated vocabulary at the documented boundary", () => {
    expect(loadLabelFor(0)).toBe("moderate");
    expect(loadLabelFor(ELEVATED_DAY_STRAIN_THRESHOLD - 0.1)).toBe("moderate");
    expect(loadLabelFor(ELEVATED_DAY_STRAIN_THRESHOLD)).toBe("elevated");
    expect(loadLabelFor(21)).toBe("elevated");
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

    // Sleep jsonb must be the exact shape row-mappers.ts's recoveryRowSchema
    // reads (minutes, respRate folded in — the write side conforms to the
    // read contract). Fixture: deep 5,400,000ms / rem 8,520,000ms /
    // light 12,600,000ms -> 90/142/210 min; need = baseline 28,800,000
    // + strain 600,000 = 29,400,000ms -> 490 min.
    const sleep = snapshot.sleep as Record<string, number>;
    expect(sleep).toEqual({
      respRate: 15.2,
      durationMin: 90 + 142 + 210,
      needMin: 490,
      efficiencyPct: 88,
      sleepScorePct: 78,
      deepMin: 90,
      remMin: 142,
      lightMin: 210,
    });
    expect(sleep.efficiencyPct).not.toBe(sleep.sleepScorePct);

    // No previous-day row exists, so deltas are 0 (payload schema forces
    // numbers); day_strain 14.2 >= the elevated threshold.
    expect(snapshot.payload).toEqual({
      recoveryDelta: 0,
      hrvDeltaPct: 0,
      rhrDelta: 0,
      loadLabel: "elevated",
    });

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

  it("round-trip guard: the row syncWhoop upserts parses through rowToRecovery (the app's read path)", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    await seedConnectedUser(tables, userId);
    installWhoopFetchMock({
      recovery: recoveryFixture,
      sleep: sleepFixture,
      cycle: cycleFixture,
      workout: workoutFixture,
    });

    await syncWhoop(admin, userId, {});

    // This is the write-read compatibility pin: rowToRecovery throws (Zod)
    // on any row that doesn't satisfy the read contract every screen uses.
    const domain = rowToRecovery(tables.recovery_snapshots.rows()[0]);

    expect(domain.date).toBe("2026-07-09");
    expect(domain.recoveryPct).toBe(67);
    expect(domain.hrv).toBe(54.3);
    expect(domain.rhr).toBe(48);
    expect(domain.respRate).toBe(15.2);
    expect(domain.load).toBe(14.2);
    expect(domain.loadLabel).toBe("elevated");
    expect(domain.sleep.efficiencyPct).toBe(88);
    expect(domain.sleep.sleepScorePct).toBe(78);
  });

  it("computes payload deltas against the stored previous-day row, and recomputes them identically on re-sync", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    await seedConnectedUser(tables, userId);
    // Yesterday's stored snapshot (what a prior sync run would have written).
    tables.recovery_snapshots.seed({
      user_id: userId,
      day: "2026-07-08",
      recovery_pct: 60,
      hrv_ms: 50,
      rhr: 50,
      day_strain: 10.1,
      sleep: {},
      payload: { recoveryDelta: 0, hrvDeltaPct: 0, rhrDelta: 0, loadLabel: "moderate" },
    });
    installWhoopFetchMock({
      recovery: recoveryFixture,
      sleep: sleepFixture,
      cycle: cycleFixture,
      workout: workoutFixture,
    });

    await syncWhoop(admin, userId, {});

    const today = () => tables.recovery_snapshots.rows().find((r) => r.day === "2026-07-09")!;
    // recovery 67 vs 60 -> +7; hrv 54.3 vs 50 -> +8.6% -> 9; rhr 48 vs 50 -> -2.
    const expected = { recoveryDelta: 7, hrvDeltaPct: 9, rhrDelta: -2, loadLabel: "elevated" };
    expect(today().payload).toEqual(expected);

    // Idempotency of the payload itself: re-running reads the same stored
    // previous-day row (not in-memory state) and recomputes the same values.
    installWhoopFetchMock({
      recovery: recoveryFixture,
      sleep: sleepFixture,
      cycle: cycleFixture,
      workout: workoutFixture,
    });
    await syncWhoop(admin, userId, {});
    expect(today().payload).toEqual(expected);
    expect(tables.recovery_snapshots.rows()).toHaveLength(2); // yesterday + today, no dupes
  });

  it("a multi-day sync processes days in ascending order so day 2's deltas come from day 1 written in the same run", async () => {
    const { client: admin, tables } = createFakeAdmin();
    getAdminClientMock.mockReturnValue(admin);
    await seedConnectedUser(tables, userId);

    // Build a second day from the canonical fixtures (2026-07-10, lower
    // strain), and serve the records deliberately NEWEST-FIRST — Whoop
    // returns collections in descending order, so ascending-day processing
    // must come from sync's own sorting, not response order.
    const rec1 = recoveryFixture.records[0];
    const recovery2 = {
      ...rec1,
      cycle_id: 93846,
      sleep_id: "bf6ff8d4-3333-4c9c-a361-2e5d6b3dcc9d",
      score: { ...rec1.score, recovery_score: 75, resting_heart_rate: 47, hrv_rmssd_milli: 60 },
    };
    const sleep2 = {
      ...sleepFixture.records[0],
      id: "bf6ff8d4-3333-4c9c-a361-2e5d6b3dcc9d",
      cycle_id: 93846,
    };
    const cycle2 = {
      ...cycleFixture.records[0],
      id: 93846,
      start: "2026-07-09T10:58:00.000Z",
      end: "2026-07-10T10:58:00.000Z",
      score: { ...cycleFixture.records[0].score, strain: 9.5 },
    };
    installWhoopFetchMock({
      recovery: { records: [recovery2, rec1], next_token: null },
      sleep: { records: [sleep2, ...sleepFixture.records], next_token: null },
      cycle: { records: [cycle2, ...cycleFixture.records], next_token: null },
      workout: { records: [], next_token: null },
    });

    const result = await syncWhoop(admin, userId, {});
    expect(result.ok).toBe(true);

    const byDay = (day: string) => tables.recovery_snapshots.rows().find((r) => r.day === day)!;
    // Day 1 has no predecessor -> zero deltas, strain 14.2 -> elevated.
    expect(byDay("2026-07-09").payload).toEqual({
      recoveryDelta: 0,
      hrvDeltaPct: 0,
      rhrDelta: 0,
      loadLabel: "elevated",
    });
    // Day 2's deltas come from day 1's just-written row: recovery 75 vs 67
    // -> +8; hrv 60 vs 54.3 -> +10.5% -> 10 (rounded); rhr 47 vs 48 -> -1;
    // strain 9.5 < threshold -> moderate.
    expect(byDay("2026-07-10").payload).toEqual({
      recoveryDelta: 8,
      hrvDeltaPct: 10,
      rhrDelta: -1,
      loadLabel: "moderate",
    });
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
