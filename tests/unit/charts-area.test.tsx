import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { AreaLineChart } from "@/components/charts/AreaLineChart";
import { DotTrendChart } from "@/components/charts/DotTrendChart";
import { PeriodizationBars } from "@/components/charts/PeriodizationBars";
import { SleepStagesBar } from "@/components/charts/SleepStagesBar";

const points = [
  { x: 10, y: 78 },
  { x: 39, y: 73.6 },
  { x: 68, y: 80.2 },
  { x: 97, y: 69.2 },
  { x: 126, y: 60.4 },
  { x: 156, y: 67 },
  { x: 185, y: 56 },
];

test("AreaLineChart wraps polygon+polyline+dot in a <g> clipped for a synchronized wipe", () => {
  const { container } = render(
    <AreaLineChart points={points} color="#16e06a" height={112} />
  );
  const g = container.querySelector("g");
  expect(g).toBeTruthy();
  const style = g!.getAttribute("style") || "";
  expect(style.replace(/\s/g, "")).toContain("clip-path:inset(0100%00)");
  expect(style).toContain("area-wipe");

  const polygon = g!.querySelector("polygon");
  const polyline = g!.querySelector("polyline");
  expect(polygon).toBeTruthy();
  expect(polyline).toBeTruthy();

  // polygon and polyline must share identical x-coordinates per datum (sync by construction)
  const parseXs = (attr: string) =>
    attr
      .trim()
      .split(/\s+/)
      .map((pair) => parseFloat(pair.split(",")[0]));

  const polygonXs = parseXs(polygon!.getAttribute("points")!);
  const polylineXs = parseXs(polyline!.getAttribute("points")!);

  // polygon closes the fill to the baseline: one leading point at the first
  // datum's x (dropped to the bottom) and one trailing point at the last
  // datum's x (dropped to the bottom). Stripping those leaves the same
  // per-datum x-coordinates as the polyline, confirming fill and line share
  // identical geometry (and therefore reveal in sync under one clip-path).
  expect(polygonXs.slice(1, -1)).toEqual(polylineXs);
});

test("DotTrendChart colors dots by threshold", () => {
  const trendPoints = [
    { x: 10, y: 34.6, value: 65 },
    { x: 65, y: 42.9, value: 40 },
    { x: 120, y: 39.7, value: 55 },
  ];
  const { container } = render(
    <DotTrendChart points={trendPoints} goodThreshold={60} />
  );
  const circles = container.querySelectorAll("circle");
  expect(circles.length).toBe(3);
  expect(container.querySelector('circle[fill="#16e06a"]')).toBeTruthy();
  expect(container.querySelectorAll('circle[fill="#FFCE3F"]').length).toBe(2);
});

test("PeriodizationBars renders 16 bars", () => {
  const weeks = Array.from({ length: 16 }, (_, i) => ({
    phase: (i < 4 ? "base" : i < 10 ? "build" : i < 13 ? "peak" : "taper") as
      | "base"
      | "build"
      | "peak"
      | "taper",
    mi: 20 + i * 2,
  }));
  const { container } = render(
    <PeriodizationBars weeks={weeks} currentWeek={7} />
  );
  const bars = container.querySelectorAll("[data-bar]");
  expect(bars.length).toBe(16);
});

test("SleepStagesBar shows Deep 1:07 legend given deepMin 67", () => {
  const { getByText } = render(
    <SleepStagesBar deepMin={67} remMin={85} lightMin={188} needMin={464} />
  );
  expect(getByText(/Deep 1:07/)).toBeInTheDocument();
});
