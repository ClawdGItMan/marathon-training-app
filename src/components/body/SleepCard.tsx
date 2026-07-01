import { SleepStagesBar } from "@/components/charts/SleepStagesBar";
import { formatHM } from "@/lib/format";

export function SleepCard({
  durationMin,
  needMin,
  efficiencyPct,
  deepMin,
  remMin,
  lightMin,
}: {
  durationMin: number;
  needMin: number;
  efficiencyPct: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
}) {
  return (
    <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[15px_15px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-num text-[26px] tracking-[-.01em] text-white">
            {formatHM(durationMin)}
          </span>
          <span className="font-ui text-[12px] font-semibold text-[#8a919c]">
            of {formatHM(needMin)} need
          </span>
        </div>
        <div className="text-right">
          <div className="font-ui text-[9px] font-bold tracking-[.1em] text-[#7b828c]">
            EFFICIENCY
          </div>
          <div className="mt-[2px] font-num text-[16px] text-white">{efficiencyPct}%</div>
        </div>
      </div>
      <div className="mt-[13px]">
        <SleepStagesBar deepMin={deepMin} remMin={remMin} lightMin={lightMin} needMin={needMin} />
      </div>
    </div>
  );
}
