import { expect, test } from "vitest";
import { formatPace, formatHM, formatClock } from "@/lib/format";

test("formatPace", () => expect(formatPace(541)).toBe("9:01"));
test("formatHM", () => expect(formatHM(372)).toBe("6:12"));
test("formatClock", () => expect(formatClock(14170)).toBe("3:56:10"));
