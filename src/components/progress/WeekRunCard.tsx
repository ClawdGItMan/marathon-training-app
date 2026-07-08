import { StatGrid } from "@/components/ui/StatGrid";
import { AreaLineChart, type AreaLineChartPoint } from "@/components/charts/AreaLineChart";

const CHART_HEIGHT = 92;
const CHART_WIDTH = 340;
// Baseline sits near the bottom of the chart; headroom keeps the peak clear
// of the top edge. Design ref #7b: viewBox 348x92, gridlines at y 22/52/82.
const BASELINE_Y = 82;
const HEADROOM_Y = 8;
const GRIDLINE_Y = [22, 52, 82];

/**
 * Scales mileage to the chart's vertical band based on the actual data's max
 * value (so any range fits without clipping) — mirrors the design's fixed
 * chart proportions without hardcoding a scale that only fits the mockup's
 * illustrative values.
 */
function buildScale(mileage: number[]) {
  const max = Math.max(...mileage, 20);
  const pxPerMile = (BASELINE_Y - HEADROOM_Y) / max;
  return (mi: number) => BASELINE_Y - mi * pxPerMile;
}

function toChartPoints(mileage: number[], mileageToY: (mi: number) => number): AreaLineChartPoint[] {
  if (mileage.length === 1) {
    return [{ x: CHART_WIDTH / 2, y: mileageToY(mileage[0]) }];
  }
  const step = CHART_WIDTH / (mileage.length - 1);
  return mileage.map((mi, i) => ({ x: Math.round(i * step * 10) / 10, y: mileageToY(mi) }));
}

/**
 * THIS WEEK · RUN body: stat row (no dividers) + lime mileage line on 3 plain
 * hairline gridlines with a pulsing endpoint. Design ref:
 * design-v2/Daily Screen Directions.dc.html #7b (lines ~181-194).
 */
export function WeekRunCard({
  mileage,
  xLabels,
}: {
  mileage: number[];
  xLabels: string[];
}) {
  const distance = mileage.at(-1) ?? 0;
  const mileageToY = buildScale(mileage);

  return (
    // pb-[16px]: AreaLineChart's xLabels row has no bottom padding of its own
    // (shared across charts); this keeps 16px of breathing room before the
    // Section's closing hairline, matching #7b's xLabels row padding-bottom.
    <div className="pb-[16px]">
      <div className="mt-[12px]">
        <StatGrid
          rule={false}
          items={[
            { label: "DISTANCE", value: String(distance), unit: "mi" },
            { label: "TIME", value: "4:48" },
            { label: "AVG PACE", value: "9:01", unit: "/mi" },
          ]}
        />
      </div>
      <div className="relative mt-[14px]" data-testid="week-chart">
        <AreaLineChart
          points={toChartPoints(mileage, mileageToY)}
          height={CHART_HEIGHT}
          pulseEndDot
          gridlines={GRIDLINE_Y.map((y) => ({ y, label: "" }))}
          xLabels={xLabels}
        />
      </div>
    </div>
  );
}
