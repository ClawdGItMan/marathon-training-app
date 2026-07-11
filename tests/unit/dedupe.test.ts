// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createFakeAdmin } from "../helpers/fake-admin";

/**
 * Behavioral tests for Task 11's Whoop/Strava dedupe (spec §6, verbatim in
 * task-11-brief.md's Interfaces section): a Whoop activity and a Strava
 * activity are the same physical run when sport is run-equivalent AND
 * their start/end windows overlap by >= 0.5 of the SHORTER window. Merge
 * keeps Strava's distance/pace fields, adopts Whoop's strain/HR fields, and
 * deletes the now-redundant Whoop-only row.
 *
 * `overlapRatio` is pure (no DB); `dedupeWhoop` touches `activities` via the
 * admin client, so it's tested against `createFakeAdmin` (tests/helpers).
 */

const { overlapRatio, dedupeWhoop, RUN_EQUIVALENT_SPORTS } = await import("@/lib/activities/dedupe");

afterEach(() => {
  // no globals stubbed in this file today, but keep the harness consistent
  // with the rest of the Task 11 suite in case that changes.
});

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
