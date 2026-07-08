import { expect, test } from "vitest";
import { formatPace, formatHM, formatClock, formatWeekOf, parseEstMinutes } from "@/lib/format";

test("formatPace", () => expect(formatPace(541)).toBe("9:01"));
test("formatHM", () => expect(formatHM(372)).toBe("6:12"));
test("formatClock", () => expect(formatClock(14170)).toBe("3:56:10"));

test("formatWeekOf pads the week number (Workout Detail header, design #6a)", () => {
  expect(formatWeekOf({ week: 7, totalWeeks: 16 })).toBe("WK 07/16");
});

test("parseEstMinutes extracts the ~NN min estimate from a detail string", () => {
  expect(parseEstMinutes("Intervals · 4.5 mi · ~45 min")).toBe("~45");
  expect(parseEstMinutes("5 × 600m · ~44 min")).toBe("~44");
  expect(parseEstMinutes("4 mi · Zone 2")).toBe("");
});
