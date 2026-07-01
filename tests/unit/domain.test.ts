import { expect, test } from "vitest";
import { seed } from "@/lib/data/seed";
import { proposalSchema, sessionSchema, recoverySchema } from "@/lib/domain/schemas";

test("seed sessions parse", () => { for (const s of seed.week) expect(sessionSchema.parse(s).id).toBeTruthy(); });
test("seed proposal parses and is a HOLD tempo→easy swap", () => {
  const p = proposalSchema.parse(seed.proposals[0]);
  expect(p.badge).toBe("HOLD");
  expect(p.before.type).toBe("tempo");
  expect(p.after.type).toBe("easy");
});
test("today recovery matches design mock", () => {
  const r = recoverySchema.parse(seed.recovery.at(-1));
  expect(r.recoveryPct).toBe(62); expect(r.hrv).toBe(48); expect(r.hrvDeltaPct).toBe(-12);
});
test("workout detail is Rolling 400s with 3 structure kinds", () => {
  const kinds = new Set(seed.workoutDetail.structure!.map((s) => s.kind));
  expect(seed.workoutDetail.title).toBe("Rolling 400s");
  expect(kinds).toEqual(new Set(["warmup", "rep", "recovery", "cooldown"]));
});
