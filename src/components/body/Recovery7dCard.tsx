import { DotTrendChart, type DotTrendPoint } from "@/components/charts/DotTrendChart";

const X_START = 10;
const X_END = 340;
const Y_TOP = 20;
const Y_BOTTOM = 60;

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

export function Recovery7dCard({ recoveryPct7d }: { recoveryPct7d: number[] }) {
  const points = toChartPoints(recoveryPct7d);

  return (
    <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[14px_14px_10px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      <DotTrendChart points={points} goodThreshold={67} />
    </div>
  );
}
