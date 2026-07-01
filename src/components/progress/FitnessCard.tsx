import { AreaLineChart, type AreaLineChartPoint } from "@/components/charts/AreaLineChart";

const CHART_HEIGHT = 90;
const CHART_WIDTH = 340;

function toChartPoints(values: number[]): AreaLineChartPoint[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = CHART_WIDTH / (values.length - 1);
  // Map into the chart's vertical band, leaving headroom top/bottom like the design.
  const top = 12;
  const bottom = CHART_HEIGHT - 6;
  return values.map((v, i) => ({
    x: Math.round(i * step * 10) / 10,
    y: bottom - ((v - min) / range) * (bottom - top),
  }));
}

export function FitnessCard({ fitness90d }: { fitness90d: number[] }) {
  return (
    <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[14px_15px_10px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      <div className="font-ui text-[11.5px] font-normal leading-[1.5] text-[#9aa1ab]">
        Training &amp; recovery, added up over time.
      </div>
      <div className="relative mt-[10px]">
        <AreaLineChart
          points={toChartPoints(fitness90d)}
          color="#16e06a"
          height={CHART_HEIGHT}
        />
      </div>
      <div className="flex justify-between px-[2px] pt-[6px]">
        <span className="font-ui text-[9px] font-bold text-[#697079]">MAR</span>
        <span className="font-ui text-[9px] font-bold text-[#697079]">APR</span>
        <span className="font-ui text-[9px] font-bold text-[#697079]">MAY</span>
        <span className="font-ui text-[9px] font-bold text-[#c9ced5]">NOW</span>
      </div>
    </div>
  );
}
