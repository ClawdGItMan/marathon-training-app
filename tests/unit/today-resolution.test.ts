import { describe, expect, it } from "vitest";
import { resolveTodaySessionId } from "@/lib/data/today";
import { seed } from "@/lib/data/seed";

/**
 * Final-review fix I2: "today" must resolve BY DATE (home tz) with the
 * static seed id as fallback. Post-reanchor (supabase mode) the plan's
 * dates are the real current week, so the date match wins and Log/Plan/Today
 * point at the actual weekday; in local mode the seed's frozen demo dates
 * (2026-06-29..07-05) never match a live `now`, so the fallback keeps the
 * Phase-1 behavior (seed.todaySessionId = wed-400s) byte-identical.
 */

const TZ = "America/New_York";

describe("resolveTodaySessionId", () => {
  it("date match wins: a session dated on now's local day is today's session", () => {
    // 2026-07-02T12:00:00Z is 2026-07-02 in ET -> thu-tempo.
    const id = resolveTodaySessionId(seed.week, new Date("2026-07-02T12:00:00Z"), TZ);
    expect(id).toBe("thu-tempo");
  });

  it("the match uses the HOME timezone's day, not UTC's", () => {
    // 2026-07-03T02:00:00Z is still 2026-07-02 22:00 in ET -> thu-tempo,
    // never fri-rest (which a UTC day-of would pick).
    const id = resolveTodaySessionId(seed.week, new Date("2026-07-03T02:00:00Z"), TZ);
    expect(id).toBe("thu-tempo");
  });

  it("no date match falls back to the static seed todaySessionId (local mode's frozen demo week)", () => {
    const id = resolveTodaySessionId(seed.week, new Date("2026-08-15T12:00:00Z"), TZ);
    expect(id).toBe(seed.todaySessionId);
    expect(id).toBe("wed-400s");
  });

  it("empty session list falls back too (never throws)", () => {
    expect(resolveTodaySessionId([], new Date("2026-07-02T12:00:00Z"), TZ)).toBe(
      seed.todaySessionId
    );
  });
});
