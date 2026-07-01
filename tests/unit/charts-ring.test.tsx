import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { RingGauge } from "@/components/charts/RingGauge";
import { Sparkline } from "@/components/charts/Sparkline";

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
