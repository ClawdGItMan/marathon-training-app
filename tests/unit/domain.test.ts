import { expect, test } from "vitest";
import { seed } from "@/lib/data/seed";
import { proposalSchema, sessionSchema, recoverySchema } from "@/lib/domain/schemas";

test("seed sessions parse", () => { for (const s of seed.week) expect(sessionSchema.parse(s).id).toBeTruthy(); });

test("today is Wed Jul 1 — Rolling 400s (v2 canonical day)", () => {
  expect(seed.todaySessionId).toBe("wed-400s");
  const today = seed.week.find((s) => s.id === "wed-400s")!;
  expect(today.date).toBe("2026-07-01");
  expect(today.title).toBe("Rolling 400s");
});

test("week matches design #7a: MON 29 easy done … SUN 05 long", () => {
  expect(seed.week.map((s) => s.date)).toEqual([
    "2026-06-29",
    "2026-06-30",
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
    "2026-07-04",
    "2026-07-05",
  ]);
  expect(seed.week[0].type).toBe("easy");
  expect(seed.week[0].status).toBe("completed");
  expect(seed.week.at(-1)!.type).toBe("long");
  expect(seed.week.at(-1)!.distanceMi).toBe(12);
});

test("seed proposal parses and is a HOLD 400s→easy swap targeting today", () => {
  const p = proposalSchema.parse(seed.proposals[0]);
  expect(p.badge).toBe("HOLD");
  expect(p.targetSessionId).toBe("wed-400s");
  expect(p.before.type).toBe("speed");
  expect(p.after.type).toBe("easy");
});

test("today recovery matches design mock (Wed Jul 1)", () => {
  const r = recoverySchema.parse(seed.recovery.at(-1));
  expect(r.date).toBe("2026-07-01");
  expect(r.recoveryPct).toBe(62); expect(r.hrv).toBe(48); expect(r.hrvDeltaPct).toBe(-12);
});

test("predictions carry v2 deltas from #7b (−0:24 / −0:41 / −1:05 / −2:12)", () => {
  expect(seed.predictions.map((p) => p.deltaSec)).toEqual([-24, -41, -65, -132]);
});

test("workout detail is Rolling 400s with 3 structure kinds", () => {
  const kinds = new Set(seed.workoutDetail.structure!.map((s) => s.kind));
  expect(seed.workoutDetail.title).toBe("Rolling 400s");
  expect(kinds).toEqual(new Set(["warmup", "rep", "recovery", "cooldown"]));
});
