import { describe, expect, it } from "vitest";
import { reanchorPlan } from "../../scripts/reanchor-plan";
import { seed } from "../../src/lib/data/seed";

/**
 * Hand-verified week arithmetic (see task-13-report.md for the full
 * derivation). Race day is seed.goal.date = 2026-12-13, a Sunday, so race
 * week's Monday is 2026-12-07 — by definition block week
 * `seed.block.totalWeeks` (16). Every other week counts back from there:
 * `week = totalWeeks - weeksBeforeRaceWeek`, clamped to [1, totalWeeks].
 *
 *   today (ET)     -> today's Monday -> weeksBeforeRaceWeek -> raw week -> clamped week
 *   2026-10-07 Wed  -> 2026-10-05    -> 9                   -> 7        -> 7
 *   2026-11-26 Thu  -> 2026-11-23    -> 2                   -> 14       -> 14
 *   2026-01-05 Mon  -> 2026-01-05    -> 48                  -> -32      -> 1 (clamp)
 *   2026-12-20 Sun  -> 2026-12-14    -> -1                  -> 17       -> 16 (clamp)
 *
 * Dates always follow today's *actual* current week (never a date
 * reconstructed from the clamped week number) — only the displayed
 * block.week label is clamped, per the task brief's "the CURRENT real week
 * (today, home tz) maps onto the seed's canonical week".
 *
 * The seed's own week[] weekday order (mon-easy .. sun-long) is preserved:
 * a session shifts to `<target Monday> + <that session's own ISO weekday
 * offset>`, e.g. wed-400s (Wednesday) always lands on the target week's
 * Wednesday regardless of which day of that week `today` itself is.
 */

const TZ = "America/New_York";

describe("reanchorPlan", () => {
  it("today input A: 2026-10-07 (Wed) -> block week 7, week of 2026-10-05..11", () => {
    const today = new Date("2026-10-07T12:00:00Z");
    const result = reanchorPlan(seed, today, TZ);

    expect(result.block.week).toBe(7);
    expect(result.block.totalWeeks).toBe(16);

    const dates = Object.fromEntries(result.week.map((s) => [s.id, s.date]));
    expect(dates).toEqual({
      "mon-easy": "2026-10-05",
      "tue-intervals": "2026-10-06",
      "wed-400s": "2026-10-07",
      "thu-tempo": "2026-10-08",
      "fri-rest": "2026-10-09",
      "sat-easy": "2026-10-10",
      "sun-long": "2026-10-11",
    });
    expect(result.workoutDetail.date).toBe("2026-10-07");
  });

  it("today input B: 2026-11-26 (Thu) -> block week 14, week of 2026-11-23..29", () => {
    const today = new Date("2026-11-26T12:00:00Z");
    const result = reanchorPlan(seed, today, TZ);

    expect(result.block.week).toBe(14);

    const dates = Object.fromEntries(result.week.map((s) => [s.id, s.date]));
    expect(dates).toEqual({
      "mon-easy": "2026-11-23",
      "tue-intervals": "2026-11-24",
      "wed-400s": "2026-11-25",
      "thu-tempo": "2026-11-26",
      "fri-rest": "2026-11-27",
      "sat-easy": "2026-11-28",
      "sun-long": "2026-11-29",
    });
  });

  it("clamps block.week to 1 when today is far more than totalWeeks-1 weeks before race week (2026-01-05)", () => {
    const today = new Date("2026-01-05T12:00:00Z");
    const result = reanchorPlan(seed, today, TZ);

    // Raw week would be 16 - 48 = -32; clamped to the seed's actual range.
    expect(result.block.week).toBe(1);

    // Dates still follow today's real week, not a reconstructed "week 1" date.
    const dates = Object.fromEntries(result.week.map((s) => [s.id, s.date]));
    expect(dates["mon-easy"]).toBe("2026-01-05");
    expect(dates["sun-long"]).toBe("2026-01-11");
  });

  it("clamps block.week to 16 when today is after race week (2026-12-20)", () => {
    const today = new Date("2026-12-20T12:00:00Z");
    const result = reanchorPlan(seed, today, TZ);

    // Raw week would be 16 - (-1) = 17; clamped to totalWeeks.
    expect(result.block.week).toBe(16);

    const dates = Object.fromEntries(result.week.map((s) => [s.id, s.date]));
    expect(dates["mon-easy"]).toBe("2026-12-14");
    expect(dates["sun-long"]).toBe("2026-12-20");
  });

  it("preserves weekday alignment: today landing on a different weekday within the same week yields the same plan", () => {
    const wednesday = reanchorPlan(seed, new Date("2026-10-07T12:00:00Z"), TZ); // Wed
    const saturday = reanchorPlan(seed, new Date("2026-10-10T12:00:00Z"), TZ); // Sat, same ISO week

    expect(saturday).toEqual(wednesday);
    // Sanity: the Wednesday session lands on a Wednesday, not on "today".
    const wed = wednesday.week.find((s) => s.id === "wed-400s")!;
    expect(wed.date).toBe("2026-10-07");
  });

  it("retargets proposals' before/after dates onto the same target week, keeping ids and the moved-session dual-id intact", () => {
    const today = new Date("2026-10-07T12:00:00Z");
    const result = reanchorPlan(seed, today, TZ);

    const byId = Object.fromEntries(result.proposals.map((p) => [p.id, p]));

    // proposal-1 (day scope, wed-400s <-> wed-400s "easy" swap): both before
    // and after are Wednesday sessions -> same target Wednesday.
    expect(byId["proposal-1"].targetSessionId).toBe("wed-400s");
    expect(byId["proposal-1"].before.id).toBe("wed-400s");
    expect(byId["proposal-1"].before.date).toBe("2026-10-07");
    expect(byId["proposal-1"].after.id).toBe("wed-400s");
    expect(byId["proposal-1"].after.date).toBe("2026-10-07");

    // proposal-2 (week scope, move long run sun-long -> sat-long-moved):
    // before is Sunday, after is Saturday -> distinct target dates, ids
    // (the dual-id) preserved.
    expect(byId["proposal-2"].targetSessionId).toBe("sun-long");
    expect(byId["proposal-2"].before.id).toBe("sun-long");
    expect(byId["proposal-2"].before.date).toBe("2026-10-11");
    expect(byId["proposal-2"].after.id).toBe("sat-long-moved");
    expect(byId["proposal-2"].after.date).toBe("2026-10-10");

    // proposal-3 (workout scope, wed-400s <-> 600s variant): both Wednesday.
    expect(byId["proposal-3"].targetSessionId).toBe("wed-400s");
    expect(byId["proposal-3"].before.date).toBe("2026-10-07");
    expect(byId["proposal-3"].after.date).toBe("2026-10-07");

    // Non-date fields untouched.
    expect(byId["proposal-1"].headline).toBe("Ease off today.");
    expect(byId["proposal-1"].status).toBe("proposed");
  });

  it("is deterministic and does not mutate the input seed", () => {
    const today = new Date("2026-10-07T12:00:00Z");

    const first = reanchorPlan(seed, today, TZ);
    const second = reanchorPlan(seed, today, TZ);
    expect(second).toEqual(first);

    // Purity: the shared seed singleton (imported by other modules) must be
    // untouched after reanchorPlan runs.
    expect(seed.week.find((s) => s.id === "mon-easy")!.date).toBe("2026-06-29");
    expect(seed.block.week).toBe(7);
    expect(seed.proposals.find((p) => p.id === "proposal-2")!.after.date).toBe("2026-07-04");
  });
});
