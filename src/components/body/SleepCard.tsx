import { SleepStagesBar } from "@/components/charts/SleepStagesBar";
import { formatHM } from "@/lib/format";

/**
 * SLEEP body per design #7c (lines ~281-292). The header's right side reads
 * as a single "EFFICIENCY 88%" phrase in the mock, but is split into two
 * spans here (regression guard: efficiencyPct, 88, must be independently
 * queryable and distinct from the Today ring's sleepScorePct, 78 — see
 * tests/unit/body.test.tsx). Rendered manually (not via SectionHeader/
 * Section's `header` prop, which only accepts a single context string) so
 * BodyScreen wraps this in a headerless <Section>.
 */
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
    <div className="pb-[16px]">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[.18em] text-[#9aa0a7]">
          SLEEP
        </span>
        <span className="whitespace-nowrap font-mono text-[9px] tracking-[.1em] text-[#5c6168]">
          <span>EFFICIENCY</span> <span>{efficiencyPct}%</span>
        </span>
      </div>
      <div className="mt-[10px] flex items-baseline gap-2">
        <span className="font-num text-[22px] tracking-[-.01em] text-white [font-variant-numeric:tabular-nums]">
          {formatHM(durationMin)}
        </span>
        <span className="font-mono text-[9px] tracking-[.12em] text-[#5c6168]">
          OF {formatHM(needMin)} NEED
        </span>
      </div>
      <div className="mt-3">
        <SleepStagesBar deepMin={deepMin} remMin={remMin} lightMin={lightMin} needMin={needMin} />
      </div>
    </div>
  );
}
