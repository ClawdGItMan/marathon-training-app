import { RingGauge } from "@/components/charts/RingGauge";
import { recoveryBand } from "@/lib/format";
import type { RecoverySnapshot } from "@/lib/domain/types";

/**
 * Readiness hero, ported from design-v2 #7c: 96px thin ring (stroke 2,
 * grey arc) with the score + READY inside; band/delta mono line, headline,
 * and quiet guidance on the right. Closed by a hairline rule.
 */
export function ReadinessHero({ recovery }: { recovery: RecoverySnapshot }) {
  const delta = recovery.recoveryDelta;
  const deltaLabel = `${delta < 0 ? "↓" : "↑"}${Math.abs(delta)}`;

  return (
    <div className="hairline flex items-center gap-5 px-[22px] pb-5 pt-[22px]">
      <RingGauge value={recovery.recoveryPct} size={96} stroke={2}>
        <div className="flex flex-col items-center justify-center">
          <span className="font-display text-[30px] leading-none text-white">
            {recovery.recoveryPct}
          </span>
          <span className="mt-[3px] font-mono text-[7.5px] tracking-[.16em] text-[#5c6168]">
            READY
          </span>
        </div>
      </RingGauge>
      <div className="flex-1">
        <div className="whitespace-nowrap font-mono text-[9.5px] tracking-[.16em] text-[#9aa0a7]">
          {recoveryBand(recovery.recoveryPct)} · {deltaLabel}
        </div>
        {/* Guidance copy per #7c readiness hero (static seed-phase copy). */}
        <div className="mt-[7px] font-display text-[16px] leading-[1.3] text-white">
          Below your 30-day baseline.
        </div>
        <div className="mt-[5px] font-num text-[11px] leading-[1.55] text-[#6f757d]">
          Keep today aerobic and easy on the climbs.
        </div>
      </div>
    </div>
  );
}
