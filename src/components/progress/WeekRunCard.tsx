import { StatGrid } from "@/components/ui/StatGrid";
import { AreaLineChart, type AreaLineChartPoint } from "@/components/charts/AreaLineChart";

const CHART_HEIGHT = 112;
const CHART_WIDTH = 340;
// Baseline sits at the bottom of the chart; headroom keeps the peak clear of the top edge.
const BASELINE_Y = 100;
const HEADROOM_Y = 8;

/**
 * Scales mileage to the chart's vertical band based on the actual data's max
 * value (so any range fits without clipping), then derives 20mi/10mi gridline
 * positions from that same scale — mirroring the design's fixed gridlines
 * without hardcoding a scale that only fits the mockup's illustrative values.
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
    <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[14px_15px_10px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      <StatGrid
        items={[
          { label: "DISTANCE", value: String(distance), unit: "mi" },
          { label: "TIME", value: "4:48" },
          { label: "AVG PACE", value: "9:01" },
        ]}
      />
      <div className="relative mt-[14px]" data-testid="week-chart">
        <AreaLineChart
          points={toChartPoints(mileage, mileageToY)}
          color="#16e06a"
          height={CHART_HEIGHT}
          gridlines={[
            { y: mileageToY(20), label: "20 mi" },
            { y: mileageToY(10), label: "10 mi" },
          ].filter((line) => line.y >= 0 && line.y <= CHART_HEIGHT)}
          xLabels={xLabels}
        />
      </div>
    </div>
  );
}
