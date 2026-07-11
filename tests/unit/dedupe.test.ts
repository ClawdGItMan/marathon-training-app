// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/crypto/token-cipher";
import { createFakeAdmin } from "../helpers/fake-admin";
import stravaActivityFixture from "../fixtures/strava/activity.json";
import whoopWorkoutFixture from "../fixtures/whoop/workout.json";

/**
 * Behavioral tests for Task 11's Whoop/Strava dedupe (spec §6, verbatim in
 * task-11-brief.md's Interfaces section; BIDIRECTIONAL as of fix loop 1):
 * a Whoop activity and a Strava activity are the same physical run when
 * sport is run-equivalent AND their start/end windows overlap by >= 0.5 of
 * the SHORTER window. The merge always survives as the Strava row (keeps
 * distance/pace, absorbs whoop_id/strain/HR); the redundant Whoop-only row
 * is deleted.
 *
 * `overlapRatio` is pure (no DB); `dedupeWhoop`/`dedupeStrava` touch
 * `activities` via the admin client, so they're tested against
 * `createFakeAdmin` (tests/helpers). The reverse-trigger describe block at
 * the bottom exercises the FULL webhook-first ordering flow end-to-end:
 * real `importStravaActivity`, then real `syncWhoop` (fetch-mocked at the
 * HTTP boundary, real token decryption via a mocked `getAdminClient` — the
 * same approach as whoop-sync.test.ts) — proving the fix for the ordering
 * hole where a Strava webhook import lands before the overnight Whoop sync
 * and the forward-only dedupe could never merge the pair.
 */

const { getAdminClientMock } = vi.hoisted(() => ({ getAdminClientMock: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: getAdminClientMock }));

const { overlapRatio, dedupeWhoop, dedupeStrava } = await import("@/lib/activities/dedupe");
const { RUN_EQUIVALENT_SPORTS } = await import("@/lib/activities/sports");
const { importStravaActivity } = await import("@/lib/integrations/strava/sync");
const { syncWhoop } = await import("@/lib/integrations/whoop/sync");
const { stravaActivitySchema } = await import("@/lib/integrations/strava/wire");

describe("RUN_EQUIVALENT_SPORTS", () => {
  it("includes Strava's Run/TrailRun/VirtualRun sport_type values and Whoop's lowercase 'running' sport_name", () => {
    expect(RUN_EQUIVALENT_SPORTS.has("Run")).toBe(true);
    expect(RUN_EQUIVALENT_SPORTS.has("TrailRun")).toBe(true);
    expect(RUN_EQUIVALENT_SPORTS.has("VirtualRun")).toBe(true);
    expect(RUN_EQUIVALENT_SPORTS.has("running")).toBe(true);
    expect(RUN_EQUIVALENT_SPORTS.has("Ride")).toBe(false);
  });
});

describe("overlapRatio", () => {
  const base = new Date("2026-07-09T13:00:00.000Z");
  function minutesLater(mins: number): Date {
    return new Date(base.getTime() + mins * 60_000);
  }

  it("returns 1 for identical windows", () => {
    expect(overlapRatio(base, minutesLater(60), base, minutesLater(60))).toBe(1);
  });

  it("returns 0 for non-overlapping windows", () => {
    expect(overlapRatio(base, minutesLater(60), minutesLater(120), minutesLater(180))).toBe(0);
  });

  it("boundary: 0.49 of the shorter (60min) window does NOT reach the 0.5 merge threshold", () => {
    // a: 60min window [0,60). b: 60min window starting 30.6min in -> overlap
    // is 29.4min of the 60min shorter window = 0.49 exactly.
    const aStart = base;
    const aEnd = minutesLater(60);
    const bStart = minutesLater(30.6);
    const bEnd = minutesLater(90.6);
    const ratio = overlapRatio(aStart, aEnd, bStart, bEnd);
    expect(ratio).toBeCloseTo(0.49, 5);
    expect(ratio).toBeLessThan(0.5);
  });

  it("boundary: exactly 0.5 of the shorter window reaches the merge threshold", () => {
    const aStart = base;
    const aEnd = minutesLater(60);
    const bStart = minutesLater(30);
    const bEnd = minutesLater(90);
    expect(overlapRatio(aStart, aEnd, bStart, bEnd)).toBeCloseTo(0.5, 10);
  });

  it("divides by the SHORTER window, not the longer one", () => {
    // a: 20min window fully inside b's 100min window -> full overlap of the
    // shorter (20min) window = 1, even though it's only 20% of b.
    const aStart = minutesLater(10);
    const aEnd = minutesLater(30);
    const bStart = base;
    const bEnd = minutesLater(100);
    expect(overlapRatio(aStart, aEnd, bStart, bEnd)).toBe(1);
  });

  it("returns 0 when either window has zero or negative duration", () => {
    expect(overlapRatio(base, base, base, minutesLater(60))).toBe(0);
  });
});

function seedActivitiesTable(tables: ReturnType<typeof createFakeAdmin>["tables"]) {
  return tables.activities;
}

describe("dedupeWhoop", () => {
  const userId = "user-1";

  it("merges an overlapping run-equivalent Whoop row into the imported Strava row, keeping Strava distance/pace and adopting Whoop strain/HR, then deletes the Whoop row", async () => {
    const { client: admin, tables } = createFakeAdmin(["activities"]);
    const table = seedActivitiesTable(tables);

    const whoopRow = {
      id: "whoop-row-id",
      user_id: userId,
      strava_id: null,
      whoop_id: "whoop-123",
      sport: "running",
      started_at: "2026-07-09T13:02:00.000Z",
      ended_at: "2026-07-09T14:01:00.000Z",
      distance_m: null,
      moving_sec: null,
      avg_pace_sec_per_mi: null,
      avg_hr: 152,
      max_hr: 178,
      strain: 11.8,
      hr_zones: { zone_two_milli: 900000 },
      matched_session_id: null,
      payload: {},
    };
    table.seed(whoopRow);

    const imported = {
      id: "strava-row-id",
      user_id: userId,
      strava_id: 154504250376823,
      whoop_id: null,
      sport: "Run",
      started_at: "2026-07-09T13:03:00.000Z", // overlaps whoopRow's window well past 50%
      ended_at: "2026-07-09T14:02:00.000Z",
      distance_m: 16093,
      moving_sec: 4517,
      avg_pace_sec_per_mi: 450.7,
      avg_hr: 150,
      max_hr: 175,
      strain: null,
      hr_zones: null,
      matched_session_id: null,
      payload: { title: "Morning Run" },
    };
    table.seed(imported);

    await dedupeWhoop(admin, userId, imported);

    expect(table.rows()).toHaveLength(1);
    const merged = table.rows()[0];
    expect(merged.id).toBe("strava-row-id");
    // Strava is source of truth for distance/pace — untouched by the merge.
    expect(merged.distance_m).toBe(16093);
    expect(merged.moving_sec).toBe(4517);
    expect(merged.avg_pace_sec_per_mi).toBe(450.7);
    // Whoop contributes strain/HR — adopted from the merged-away row.
    expect(merged.strain).toBe(11.8);
    expect(merged.avg_hr).toBe(152);
    expect(merged.max_hr).toBe(178);
    expect(merged.hr_zones).toEqual({ zone_two_milli: 900000 });
    expect(merged.whoop_id).toBe("whoop-123");
  });

  it("does not merge when the overlap is below the 0.5 threshold", async () => {
    const { client: admin, tables } = createFakeAdmin(["activities"]);
    const table = seedActivitiesTable(tables);

    table.seed({
      id: "whoop-row-id",
      user_id: userId,
      strava_id: null,
      whoop_id: "whoop-123",
      sport: "running",
      started_at: "2026-07-09T13:00:00.000Z",
      ended_at: "2026-07-09T14:00:00.000Z",
      avg_hr: 152,
      max_hr: 178,
      strain: 11.8,
      hr_zones: null,
      payload: {},
    });

    const imported = {
      id: "strava-row-id",
      user_id: userId,
      sport: "Run",
      started_at: "2026-07-09T13:40:00.000Z", // only 20min of a 60min window -> 0.33
      ended_at: "2026-07-09T14:40:00.000Z",
    };
    table.seed({ ...imported, strava_id: 1, distance_m: 5000, avg_hr: 140 });

    await dedupeWhoop(admin, userId, { ...imported, distance_m: 5000, avg_hr: 140 } as never);

    expect(table.rows()).toHaveLength(2);
  });

  it("does not merge when the Whoop candidate's sport is not run-equivalent", async () => {
    const { client: admin, tables } = createFakeAdmin(["activities"]);
    const table = seedActivitiesTable(tables);

    table.seed({
      id: "whoop-row-id",
      user_id: userId,
      strava_id: null,
      whoop_id: "whoop-strength",
      sport: "weightlifting",
      started_at: "2026-07-09T13:00:00.000Z",
      ended_at: "2026-07-09T14:00:00.000Z",
      avg_hr: 130,
      max_hr: 160,
      strain: 8,
      hr_zones: null,
      payload: {},
    });

    const imported = {
      id: "strava-row-id",
      user_id: userId,
      strava_id: 1,
      sport: "Run",
      started_at: "2026-07-09T13:00:00.000Z",
      ended_at: "2026-07-09T14:00:00.000Z",
      distance_m: 5000,
    };
    table.seed(imported);

    await dedupeWhoop(admin, userId, imported);

    expect(table.rows()).toHaveLength(2);
  });

  it("is a no-op (no query at all) when the imported activity's own sport is not run-equivalent", async () => {
    const { client: admin, tables } = createFakeAdmin(["activities"]);
    const table = seedActivitiesTable(tables);
    table.seed({
      id: "whoop-row-id",
      user_id: userId,
      strava_id: null,
      whoop_id: "whoop-123",
      sport: "running",
      started_at: "2026-07-09T13:00:00.000Z",
      ended_at: "2026-07-09T14:00:00.000Z",
      payload: {},
    });

    const imported = {
      id: "strava-row-id",
      user_id: userId,
      strava_id: 1,
      sport: "Ride",
      started_at: "2026-07-09T13:00:00.000Z",
      ended_at: "2026-07-09T14:00:00.000Z",
    };
    table.seed(imported);

    await dedupeWhoop(admin, userId, imported);

    expect(table.rows()).toHaveLength(2); // untouched — nothing merged
  });

  it("ignores whoop-only rows belonging to a different user", async () => {
    const { client: admin, tables } = createFakeAdmin(["activities"]);
    const table = seedActivitiesTable(tables);
    table.seed({
      id: "other-user-whoop-row",
      user_id: "someone-else",
      strava_id: null,
      whoop_id: "whoop-999",
      sport: "running",
      started_at: "2026-07-09T13:00:00.000Z",
      ended_at: "2026-07-09T14:00:00.000Z",
      payload: {},
    });

    const imported = {
      id: "strava-row-id",
      user_id: userId,
      strava_id: 1,
      sport: "Run",
      started_at: "2026-07-09T13:00:00.000Z",
      ended_at: "2026-07-09T14:00:00.000Z",
    };
    table.seed(imported);

    await dedupeWhoop(admin, userId, imported);

    expect(table.rows()).toHaveLength(2);
  });
});

// ---- reverse trigger: dedupeStrava via syncWhoop (fix loop 1) -----------------
// End-to-end proof of the webhook-first ordering fix: a Strava activity is
// imported FIRST (as the webhook would), then syncWhoop runs with the
// overnight Whoop workout — the newly-inserted Whoop row must merge into
// the pre-existing Strava row at insertion time, because the morning sweep
// can never heal this case (the webhook's own ok sync_runs row advances
// lastOkStravaSync past the activity's start, so it is never re-imported).

const REVERSE_TABLES = [
  "profiles",
  "integration_tokens",
  "planned_sessions",
  "activities",
  "recovery_snapshots",
  "sync_runs",
] as const;

const REVERSE_USER = "user-1";

// stravaActivityFixture: start 2026-07-09T11:03:51Z, elapsed 4600s -> ends
// ~12:20:31Z. This Whoop window (11:05-12:15Z) sits fully inside it ->
// overlap ratio 1.0 of the shorter (70min) window.
const OVERLAPPING_WHOOP_WORKOUT = {
  ...whoopWorkoutFixture.records[0],
  start: "2026-07-09T11:05:00.000Z",
  end: "2026-07-09T12:15:00.000Z",
};

function seedWhoopConnectedUser(tables: ReturnType<typeof createFakeAdmin<(typeof REVERSE_TABLES)[number]>>["tables"]) {
  tables.profiles.seed({ id: REVERSE_USER, home_timezone: "America/New_York" });
  const encrypted = encryptToken(JSON.stringify({ access: "access-tok", refresh: "refresh-tok" }));
  tables.integration_tokens.seed({
    user_id: REVERSE_USER,
    provider: "whoop",
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    expires_at: "2026-08-01T00:00:00.000Z",
    athlete_ref: null,
  });
}

function seedPlannedLongRun(tables: ReturnType<typeof createFakeAdmin<(typeof REVERSE_TABLES)[number]>>["tables"]) {
  tables.planned_sessions.seed({
    id: "sun-long",
    user_id: REVERSE_USER,
    date: "2026-07-09",
    title: "Long run",
    type: "long",
    detail: null,
    structure: [],
    status: "planned",
    provenance: "original",
    payload: { distanceMi: 10 },
  });
}

/** Empty recovery/sleep/cycle collections; `workoutRecords` from the workout endpoint. */
function installWhoopFetchMock(workoutRecords: unknown[]) {
  const empty = { records: [], next_token: null };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(input.toString());
      const body = url.pathname.endsWith("/activity/workout")
        ? { records: workoutRecords, next_token: null }
        : empty;
      return { ok: true, status: 200, statusText: "OK", json: async () => body };
    })
  );
}

describe("reverse trigger: dedupeStrava via syncWhoop (webhook-first ordering)", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("webhook-first end-to-end: importStravaActivity then syncWhoop with an overlapping workout -> ONE merged row, Strava distance + Whoop strain, matched session unaffected", async () => {
    const { client: admin, tables } = createFakeAdmin(REVERSE_TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedWhoopConnectedUser(tables);
    seedPlannedLongRun(tables);

    // 1. Webhook-first: the Strava run arrives and matches its session.
    const imported = await importStravaActivity(
      admin,
      REVERSE_USER,
      stravaActivitySchema.parse(stravaActivityFixture)
    );
    expect(imported.matchedSessionId).toBe("sun-long");
    expect(tables.activities.rows()).toHaveLength(1);

    // 2. Overnight Whoop sync delivers the same physical run.
    installWhoopFetchMock([OVERLAPPING_WHOOP_WORKOUT]);
    const result = await syncWhoop(admin, REVERSE_USER, {});
    expect(result.ok).toBe(true);

    // Exactly ONE row survives: the Strava row, now carrying Whoop's fields.
    expect(tables.activities.rows()).toHaveLength(1);
    const merged = tables.activities.rows()[0];
    expect(merged.strava_id).toBe(stravaActivityFixture.id);
    expect(merged.distance_m).toBe(16093); // Strava source of truth
    expect(merged.moving_sec).toBe(4517);
    expect(merged.whoop_id).toBe(OVERLAPPING_WHOOP_WORKOUT.id); // absorbed
    expect(merged.strain).toBe(11.8);
    expect(merged.hr_zones).toMatchObject({ zone_two_milli: 900000 });
    // The session match is untouched by the merge.
    expect(merged.matched_session_id).toBe("sun-long");
    expect(tables.planned_sessions.rows().find((r) => r.id === "sun-long")!.status).toBe("completed");
  });

  it("a NON-overlapping same-day whoop workout does not merge -> two rows", async () => {
    const { client: admin, tables } = createFakeAdmin(REVERSE_TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedWhoopConnectedUser(tables);

    await importStravaActivity(admin, REVERSE_USER, stravaActivitySchema.parse(stravaActivityFixture));

    // The canonical fixture's window is 13:02-14:01Z — same local day, but
    // zero overlap with the Strava run's 11:03-12:20Z window.
    installWhoopFetchMock([whoopWorkoutFixture.records[0]]);
    const result = await syncWhoop(admin, REVERSE_USER, {});
    expect(result.ok).toBe(true);

    expect(tables.activities.rows()).toHaveLength(2);
    const whoopRow = tables.activities.rows().find((r) => r.whoop_id);
    expect(whoopRow?.strava_id).toBeUndefined();
  });

  it("reverse trigger respects run-equivalence: an overlapping whoop BIKE workout never merges into a Strava run", async () => {
    const { client: admin, tables } = createFakeAdmin(REVERSE_TABLES);
    getAdminClientMock.mockReturnValue(admin);
    seedWhoopConnectedUser(tables);

    await importStravaActivity(admin, REVERSE_USER, stravaActivitySchema.parse(stravaActivityFixture));

    installWhoopFetchMock([{ ...OVERLAPPING_WHOOP_WORKOUT, sport_name: "cycling" }]);
    const result = await syncWhoop(admin, REVERSE_USER, {});
    expect(result.ok).toBe(true);

    expect(tables.activities.rows()).toHaveLength(2);
  });

  it("dedupeStrava skips a Strava row that already carries a whoop_id (already merged with its twin)", async () => {
    const { client: admin, tables } = createFakeAdmin(["activities"]);
    tables.activities.seed({
      id: "strava-row-id",
      user_id: REVERSE_USER,
      strava_id: 1,
      whoop_id: "already-merged-whoop-id",
      sport: "Run",
      started_at: "2026-07-09T11:05:00.000Z",
      ended_at: "2026-07-09T12:15:00.000Z",
      payload: {},
    });
    tables.activities.seed({
      id: "new-whoop-row",
      user_id: REVERSE_USER,
      strava_id: null,
      whoop_id: "second-whoop-id",
      sport: "running",
      started_at: "2026-07-09T11:05:00.000Z",
      ended_at: "2026-07-09T12:15:00.000Z",
      payload: {},
    });

    await dedupeStrava(admin, REVERSE_USER, {
      id: "new-whoop-row",
      sport: "running",
      started_at: "2026-07-09T11:05:00.000Z",
      ended_at: "2026-07-09T12:15:00.000Z",
      whoop_id: "second-whoop-id",
      strain: 9.1,
      avg_hr: 140,
      max_hr: 165,
      hr_zones: null,
    });

    // No merge: both rows survive, the merged row's whoop_id is untouched.
    expect(tables.activities.rows()).toHaveLength(2);
    expect(tables.activities.rows().find((r) => r.id === "strava-row-id")!.whoop_id).toBe(
      "already-merged-whoop-id"
    );
  });
});
