import { DotTrendChart, type DotTrendPoint } from "@/components/charts/DotTrendChart";

const X_START = 10;
const X_END = 340;
// Design #7c RECOVERY · 7 DAYS viewBox is 348x56 (not the chart's 92px
// default) — headroom matches the mock's ~14-38 point spread within that box.
const CHART_HEIGHT = 56;
const Y_TOP = 14;
const Y_BOTTOM = 40;

function toChartPoints(values: number[]): DotTrendPoint[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? (X_END - X_START) / (values.length - 1) : 0;

  return values.map((value, i) => ({
    x: Math.round((X_START + i * step) * 10) / 10,
    // Higher recovery -> higher on screen (smaller y).
    y: Math.round((Y_BOTTOM - ((value - min) / range) * (Y_BOTTOM - Y_TOP)) * 10) / 10,
    value,
  }));
}

/**
 * RECOVERY · 7 DAYS body per design #7c (lines ~294-302): grey dot-trend
 * line with a lime "today" endpoint over a mid-height hairline, closed with
 * a hairline rule (pb-16 here; Section supplies the rule itself).
 */
export function Recovery7dCard({ recoveryPct7d }: { recoveryPct7d: number[] }) {
  const points = toChartPoints(recoveryPct7d);

  return (
    <div className="pb-[14px]">
      <div className="mt-[12px]">
        <DotTrendChart points={points} height={CHART_HEIGHT} />
      </div>
    </div>
  );
}
