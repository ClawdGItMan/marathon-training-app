import { RingGauge } from "@/components/charts/RingGauge";

export function RecoveryHero({
  recoveryPct,
  recoveryDelta,
}: {
  recoveryPct: number;
  recoveryDelta: number;
}) {
  const deltaLabel = recoveryDelta > 0 ? `↑${recoveryDelta}` : `↓${Math.abs(recoveryDelta)}`;

  return (
    <div className="flex items-center gap-4 px-[18px] pb-[6px] pt-4">
      <RingGauge value={recoveryPct} max={100} color="#FFCE3F" size={120} stroke={9}>
        <span className="font-num text-[27px] tracking-[-.02em] text-white">
          {recoveryPct}
        </span>
      </RingGauge>
      <div className="flex-1">
        <div className="font-ui text-[11px] font-bold tracking-[.13em] text-[#FFCE3F]">
          MODERATE · {deltaLabel}
        </div>
        <div className="mt-[7px] font-ui text-[15px] font-semibold leading-[1.35] text-[#e4e7eb]">
          Below your 30-day baseline.
        </div>
        <div className="mt-[5px] font-ui text-[12.5px] leading-[1.5] text-[#9aa1ab]">
          Recovery is trending down. Favor easy volume and protect the tendon.
        </div>
      </div>
    </div>
  );
}
