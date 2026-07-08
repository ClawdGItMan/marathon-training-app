import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { AreaLineChart } from "@/components/charts/AreaLineChart";
import { DotTrendChart } from "@/components/charts/DotTrendChart";
import { PeriodizationBars } from "@/components/charts/PeriodizationBars";
import { SleepStagesBar } from "@/components/charts/SleepStagesBar";

// vitest.config has no `globals: true`, so RTL cannot auto-register its afterEach
// cleanup — without this, repeated renders of the same component leak across tests
// and getByText matches multiple elements.
afterEach(cleanup);

const points = [
  { x: 10, y: 78 },
  { x: 39, y: 73.6 },
  { x: 68, y: 80.2 },
  { x: 97, y: 69.2 },
  { x: 126, y: 60.4 },
  { x: 156, y: 67 },
  { x: 185, y: 56 },
];

const weeks16 = Array.from({ length: 16 }, (_, i) => ({
  phase: (i < 4 ? "base" : i < 10 ? "build" : i < 13 ? "peak" : "taper") as
    | "base"
    | "build"
    | "peak"
    | "taper",
  mi: 20 + i * 2,
}));

test("AreaLineChart wraps polygon+polyline+dot in a <g> clipped for a synchronized wipe when filled", () => {
  const { container } = render(
    <AreaLineChart points={points} color="#16e06a" height={112} fillOpacity={0.12} />
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

test("AreaLineChart defaults to a pure lime line: no polygon, #C9F53F stroke", () => {
  const { container } = render(<AreaLineChart points={points} height={112} />);
  expect(container.querySelector("polygon")).toBeNull();

  const polyline = container.querySelector("polyline");
  expect(polyline).toBeTruthy();
  expect(polyline).toHaveAttribute("stroke", "#C9F53F");
  expect(polyline).toHaveAttribute("stroke-width", "1.6");
});

test("AreaLineChart pulseEndDot pulses the endpoint dot over 3.2s; off by default", () => {
  const { container: pulsing } = render(
    <AreaLineChart points={points} height={112} pulseEndDot />
  );
  const pulsingDot = pulsing.querySelector("circle");
  expect(pulsingDot).toBeTruthy();
  const pulsingStyle = pulsingDot!.getAttribute("style") || "";
  expect(pulsingStyle).toContain("limePulse");
  expect(pulsingStyle).toContain("3.2s");

  const { container: still } = render(<AreaLineChart points={points} height={112} />);
  const stillDot = still.querySelector("circle");
  expect(stillDot).toBeTruthy();
  expect(stillDot!.getAttribute("style") || "").not.toContain("limePulse");
});

test("AreaLineChart gridlines use the hairline token and mono grey labels", () => {
  const { container } = render(
    <AreaLineChart
      points={points}
      height={112}
      gridlines={[{ y: 30, label: "20 mi" }]}
    />
  );
  const line = container.querySelector("line");
  expect(line).toHaveAttribute("stroke", "var(--hair)");
  const label = container.querySelector("text");
  expect(label!.getAttribute("style") || "").toContain("var(--font-mono)");
  expect(label!.getAttribute("style") || "").toContain("rgb(92, 97, 104)");
});

test("DotTrendChart renders grey dots with a lime last dot; goodThreshold is accepted but inert", () => {
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
  // last dot is lime regardless of value vs. threshold; the rest are grey
  expect(container.querySelector('circle[fill="#C9F53F"]')).toBeTruthy();
  expect(container.querySelectorAll('circle[fill="#9aa0a7"]').length).toBe(2);
  // old threshold-driven colors must be gone
  expect(container.querySelector('circle[fill="#16e06a"]')).toBeNull();
  expect(container.querySelector('circle[fill="#FFCE3F"]')).toBeNull();
  // last dot carries the lime pulse
  const lastDot = container.querySelector('circle[fill="#C9F53F"]');
  expect(lastDot!.getAttribute("style") || "").toContain("limePulse");
});

test("DotTrendChart connecting line is grey #565b62 with the drw draw-in dash per design", () => {
  const trendPoints = [
    { x: 10, y: 34.6, value: 65 },
    { x: 65, y: 42.9, value: 40 },
    { x: 120, y: 39.7, value: 55 },
  ];
  const { container } = render(
    <DotTrendChart points={trendPoints} goodThreshold={60} />
  );
  const polyline = container.querySelector("polyline");
  expect(polyline).toHaveAttribute("stroke", "#565b62");
  expect(polyline).toHaveAttribute("stroke-dasharray", "380");
  expect(polyline!.getAttribute("style") || "").toContain("drw");
});

test("DotTrendChart renders a mid-height hairline reference line per design #7c", () => {
  const trendPoints = [
    { x: 10, y: 34.6, value: 65 },
    { x: 65, y: 42.9, value: 40 },
    { x: 120, y: 39.7, value: 55 },
  ];
  const { container } = render(
    <DotTrendChart points={trendPoints} goodThreshold={60} height={56} />
  );
  const line = container.querySelector("line");
  expect(line).toBeTruthy();
  expect(line).toHaveAttribute("stroke", "rgba(255,255,255,.07)");
  expect(line).toHaveAttribute("y1", "28");
  expect(line).toHaveAttribute("y2", "28");
});

test("PeriodizationBars renders 16 bars", () => {
  const { container } = render(
    <PeriodizationBars weeks={weeks16} currentWeek={7} />
  );
  const bars = container.querySelectorAll("[data-bar]");
  expect(bars.length).toBe(16);
});

test("PeriodizationBars renders the current week bar in lime, all others in phase greys", () => {
  const { container } = render(
    <PeriodizationBars weeks={weeks16} currentWeek={7} />
  );
  const bars = container.querySelectorAll("[data-bar]");
  const currentBar = bars[6]; // currentWeek=7 is 1-indexed -> index 6
  expect(currentBar.getAttribute("style") || "").toContain("rgb(201, 245, 63)");

  const limeBars = Array.from(bars).filter((b) =>
    (b.getAttribute("style") || "").includes("rgb(201, 245, 63)")
  );
  expect(limeBars.length).toBe(1);

  // remaining bars must use the instrument phase greys, never the old blue/yellow palette
  const allowedGreys = ["rgb(36, 41, 48)", "rgb(45, 51, 59)", "rgb(54, 61, 70)"];
  Array.from(bars)
    .filter((b) => b !== currentBar)
    .forEach((bar) => {
      const style = bar.getAttribute("style") || "";
      expect(allowedGreys.some((grey) => style.includes(grey))).toBe(true);
    });
});

test("PeriodizationBars bars rise from the bottom with a ~35ms stagger", () => {
  const { container } = render(
    <PeriodizationBars weeks={weeks16} currentWeek={7} />
  );
  const bars = Array.from(container.querySelectorAll("[data-bar]"));
  bars.forEach((bar) => {
    const style = bar.getAttribute("style") || "";
    expect(style).toContain("transform-origin: bottom");
    expect(style).toContain("barUp");
  });

  // staggered: each bar's animation-delay increases by ~35ms
  const delays = bars.map((bar) => {
    const style = bar.getAttribute("style") || "";
    const match = style.match(/barUp[^;]*?([\d.]+)s\s+both/);
    return match ? parseFloat(match[1]) : null;
  });
  expect(delays[0]).not.toBeNull();
  expect(delays[1]).not.toBeNull();
  expect(delays[1]! - delays[0]!).toBeCloseTo(0.035, 2);
});

test("SleepStagesBar shows Deep 1:07 legend given deepMin 67, with instrument grey stages", () => {
  const { getByText, container } = render(
    <SleepStagesBar deepMin={67} remMin={85} lightMin={188} needMin={464} />
  );
  expect(getByText(/Deep 1:07/)).toBeInTheDocument();

  // Deep segment uses the design's bright instrument grey (#e8eaec = rgb(232, 234, 236)), not v1 blue
  const allDivs = container.querySelectorAll("div");
  const deepSegment = Array.from(allDivs).find((div) => {
    const style = div.getAttribute("style") || "";
    return style.includes("rgb(232, 234, 236)");
  });
  expect(deepSegment).toBeTruthy();

  // v1 blues must be gone entirely
  const html = container.innerHTML;
  expect(html).not.toContain("rgb(44, 91, 134)"); // #2c5b86
  expect(html).not.toContain("rgb(52, 179, 230)"); // #34B3E6
  expect(html).not.toContain("rgb(124, 179, 217)"); // #7CB3D9
});

test("SleepStagesBar legend uses per-stage instrument greys per design #7c (DEEP #9aa0a7 / REM #7c828a / LIGHT #565b62)", () => {
  const { getByText } = render(
    <SleepStagesBar deepMin={67} remMin={85} lightMin={188} needMin={464} />
  );
  const deepLabel = getByText(/Deep 1:07/);
  const remLabel = getByText(/REM/);
  const lightLabel = getByText(/Light/);

  expect(deepLabel.getAttribute("style") || "").toContain("rgb(154, 160, 167)"); // #9aa0a7
  expect(remLabel.getAttribute("style") || "").toContain("rgb(124, 130, 138)"); // #7c828a
  expect(lightLabel.getAttribute("style") || "").toContain("rgb(86, 91, 98)"); // #565b62

  [deepLabel, remLabel, lightLabel].forEach((label) => {
    expect(label.getAttribute("style") || "").toContain("var(--font-mono)");
  });
});
