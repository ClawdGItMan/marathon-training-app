import { expect, test } from "vitest";
import {
  formatPace,
  formatHM,
  formatClock,
  formatWeekOf,
  parseEstMinutes,
  formatActivityTitle,
  formatMinSec,
  formatRaceDateLong,
} from "@/lib/format";

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

test("formatActivityTitle strips the redundant distance suffix (Log imported-run headline, design #7d)", () => {
  expect(formatActivityTitle("Easy run · 4 mi")).toBe("Easy run");
  expect(formatActivityTitle("Long run")).toBe("Long run");
});

test("formatMinSec renders plain m:ss with no hour segment (Log TIME stat, design #7d)", () => {
  expect(formatMinSec(2304)).toBe("38:24");
  expect(formatMinSec(65)).toBe("1:05");
});

test("formatRaceDateLong renders an uppercase-month race date (Settings RACE line, R12)", () => {
  expect(formatRaceDateLong("2026-12-13")).toBe("DEC 13 2026");
});
