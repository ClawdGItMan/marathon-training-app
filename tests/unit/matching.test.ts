import { describe, expect, it } from "vitest";
import type { PlannedSession } from "@/lib/domain/types";

/**
 * Behavioral tests for Task 11's session-matching rules (spec §6, verbatim
 * in task-11-brief.md's Interfaces section): an imported run matches a
 * planned session iff (a) same local day (home tz — the caller precomputes
 * the activity's local day via localDayOf and passes it in as
 * `MatchableActivity.localDay`, keeping this module pure/tz-agnostic), (b)
 * the session's type is a run type, (c) the session isn't already
 * `completed`. Among matches, closest `|distanceMi diff|` wins; an exact
 * tie breaks by priority order [speed, tempo, long, easy].
 *
 * `matchSession` is a pure function — no Supabase/DB involved — so these
 * are plain unit tests, no mocking required.
 */

const { matchSession, RUN_SESSION_TYPES } = await import("@/lib/activities/matching");

function session(overrides: Partial<PlannedSession>): PlannedSession {
  return {
    id: "s-1",
    date: "2026-07-09",
    type: "easy",
    title: "Easy run",
    detail: "",
    status: "planned",
    provenance: "original",
    distanceMi: 4,
    ...overrides,
  };
}

describe("RUN_SESSION_TYPES", () => {
  it("is exactly the four run types (rest/strength/recovery excluded)", () => {
    expect([...RUN_SESSION_TYPES].sort()).toEqual(["easy", "long", "speed", "tempo"]);
  });
});

describe("matchSession", () => {
  it("matches an exact-distance same-day run session", () => {
    const target = session({ id: "wed-easy", type: "easy", date: "2026-07-09", distanceMi: 4 });
    const result = matchSession({ localDay: "2026-07-09", distanceMi: 4 }, [target]);
    expect(result?.id).toBe("wed-easy");
  });

  it("picks the closer of two same-day candidates by distance", () => {
    const near = session({ id: "near", type: "easy", date: "2026-07-09", distanceMi: 4.2 });
    const far = session({ id: "far", type: "tempo", date: "2026-07-09", distanceMi: 8 });
    const result = matchSession({ localDay: "2026-07-09", distanceMi: 4 }, [far, near]);
    expect(result?.id).toBe("near");
  });

  it("breaks an exact distance-diff tie by priority order [speed, tempo, long, easy]", () => {
    // Both candidates are equidistant (|5-4|=1 vs |3-4|=1) from the activity's
    // 4mi — tempo must win over easy per the priority list.
    const easy = session({ id: "easy-cand", type: "easy", date: "2026-07-09", distanceMi: 3 });
    const tempo = session({ id: "tempo-cand", type: "tempo", date: "2026-07-09", distanceMi: 5 });
    const result = matchSession({ localDay: "2026-07-09", distanceMi: 4 }, [easy, tempo]);
    expect(result?.id).toBe("tempo-cand");
  });

  it("priority order holds regardless of candidate array order", () => {
    const long = session({ id: "long-cand", type: "long", date: "2026-07-09", distanceMi: 5 });
    const speed = session({ id: "speed-cand", type: "speed", date: "2026-07-09", distanceMi: 3 });
    const tempo = session({ id: "tempo-cand", type: "tempo", date: "2026-07-09", distanceMi: 3 });
    // speed and tempo are equidistant (1mi) and both closer than long (1mi too,
    // actually tie all three) — speed must win over tempo and long.
    const result = matchSession({ localDay: "2026-07-09", distanceMi: 4 }, [long, tempo, speed]);
    expect(result?.id).toBe("speed-cand");
  });

  it("returns null when no session falls on the activity's local day", () => {
    const wrongDay = session({ id: "thu-easy", type: "easy", date: "2026-07-10", distanceMi: 4 });
    const result = matchSession({ localDay: "2026-07-09", distanceMi: 4 }, [wrongDay]);
    expect(result).toBeNull();
  });

  it("returns null when the only same-day session is already completed", () => {
    const done = session({ id: "done", type: "easy", date: "2026-07-09", status: "completed", distanceMi: 4 });
    const result = matchSession({ localDay: "2026-07-09", distanceMi: 4 }, [done]);
    expect(result).toBeNull();
  });

  it("excludes non-run session types (rest/strength) even on the same day", () => {
    const rest = session({ id: "rest", type: "rest", date: "2026-07-09", distanceMi: undefined });
    const strength = session({ id: "gym", type: "strength", date: "2026-07-09", distanceMi: undefined });
    const result = matchSession({ localDay: "2026-07-09", distanceMi: 4 }, [rest, strength]);
    expect(result).toBeNull();
  });

  it("returns null for an empty session list", () => {
    expect(matchSession({ localDay: "2026-07-09", distanceMi: 4 }, [])).toBeNull();
  });
});
