import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { RingGauge } from "@/components/charts/RingGauge";
import { Sparkline } from "@/components/charts/Sparkline";

// vitest.config has no `globals: true`, so RTL cannot auto-register its afterEach
// cleanup — clean up manually to keep renders isolated between tests.
afterEach(cleanup);

test("RingGauge renders arc with given color and correct data-target-offset", () => {
  const { container } = render(
    <RingGauge value={62} max={100} color="#FFCE3F">
      <span className="font-num">62</span>
    </RingGauge>
  );
  const circles = container.querySelectorAll("circle");
  // track + arc
  expect(circles.length).toBe(2);
  const arc = container.querySelector('circle[stroke="#FFCE3F"]');
  expect(arc).toBeTruthy();
  const targetOffset = parseFloat(arc!.getAttribute("data-target-offset")!);
  // c = 2*pi*44 = 276.46..., target = c * (1 - 62/100) ~= 105.05
  expect(targetOffset).toBeCloseTo(105.05, 1);
});

test("RingGauge renders children centered over the svg", () => {
  const { getByText } = render(
    <RingGauge value={78} max={100} color="#7CB3D9">
      <span className="font-num">78%</span>
    </RingGauge>
  );
  expect(getByText("78%")).toBeInTheDocument();
});

test("RingGauge defaults to instrument track/arc colors and a thin stroke", () => {
  const { container } = render(
    <RingGauge value={62} max={100}>
      <span className="font-num">62</span>
    </RingGauge>
  );
  const circles = container.querySelectorAll("circle");
  expect(circles.length).toBe(2);
  const track = container.querySelector('circle[stroke="#242930"]');
  expect(track).toBeTruthy();
  const arc = container.querySelector('circle[stroke="#e8eaec"]');
  expect(arc).toBeTruthy();
  // thin default stroke (~5 in this 104 viewBox), not the old default of 8
  expect(arc).toHaveAttribute("stroke-width", "5");
  expect(track).toHaveAttribute("stroke-width", "5");
});

test("RingGauge sweeps the arc over 1.2s", async () => {
  const { container } = render(
    <RingGauge value={62} max={100}>
      <span className="font-num">62</span>
    </RingGauge>
  );
  const arc = container.querySelector('circle[stroke="#e8eaec"]');
  expect(arc).toBeTruthy();
  // let the component's own requestAnimationFrame callback run
  await act(async () => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
  expect((arc as SVGCircleElement).style.transition).toContain("1.2s");
});

test("Sparkline emits a polyline with one coordinate pair per datum", () => {
  const points = [10, 22, 15, 30, 18];
  const { container } = render(<Sparkline points={points} color="#7CB3D9" />);
  const polyline = container.querySelector("polyline");
  expect(polyline).toBeTruthy();
  const pointsAttr = polyline!.getAttribute("points")!;
  const pairs = pointsAttr.trim().split(/\s+/);
  expect(pairs.length).toBe(points.length);
  expect(polyline).toHaveAttribute("stroke", "#7CB3D9");
});

test("Sparkline defaults to grey stroke", () => {
  const points = [10, 22, 15, 30, 18];
  const { container } = render(<Sparkline points={points} />);
  const polyline = container.querySelector("polyline");
  expect(polyline).toHaveAttribute("stroke", "#565b62");
});

test("Sparkline renders no dot by default, and an endpoint dot when endDotColor is set", () => {
  const points = [10, 22, 15, 30, 18];
  const { container: withoutDot } = render(<Sparkline points={points} />);
  expect(withoutDot.querySelector("circle")).toBeNull();

  const { container: withDot } = render(
    <Sparkline points={points} endDotColor="#C9F53F" />
  );
  const circle = withDot.querySelector("circle");
  expect(circle).toBeTruthy();
  expect(circle).toHaveAttribute("fill", "#C9F53F");
  // endpoint dot sits at the last datum's x
  const polyline = withDot.querySelector("polyline");
  const lastPair = polyline!.getAttribute("points")!.trim().split(/\s+/).pop()!;
  expect(circle!.getAttribute("cx")).toBe(lastPair.split(",")[0]);
});
