import { describe, expect, test } from "vitest";
import { deltaColor } from "@/lib/delta-color";

describe("deltaColor", () => {
  test("non-negative → neutral", () => { expect(deltaColor(0)).toBe("#8a919c"); expect(deltaColor(3)).toBe("#8a919c"); });
  test("mild −1..−3 amber", () => expect(deltaColor(-2)).toBe("#FFCE3F"));
  test("mild −4..−6 warm", () => expect(deltaColor(-5)).toBe("#FF9A3D"));
  test("moderate −7..−13 red-orange", () => { expect(deltaColor(-7)).toBe("#F0603F"); expect(deltaColor(-12)).toBe("#F0603F"); });
  test("severe ≤−14 red", () => expect(deltaColor(-14)).toBe("#E5484D"));
});
