import { Sparkline } from "@/components/charts/Sparkline";

function formatSignedPct(pct: number): string {
  return pct > 0 ? `↑${pct}%` : `↓${Math.abs(pct)}%`;
}

function formatSignedInt(delta: number): string {
  return delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : `${delta}`;
}

export function VitalsCard({
  hrv,
  hrvDeltaPct,
  rhr,
  rhrDelta,
  respRate,
  hrv14d,
}: {
  hrv: number;
  hrvDeltaPct: number;
  rhr: number;
  rhrDelta: number;
  respRate: number;
  hrv14d: number[];
}) {
  return (
    <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      <div className="grid grid-cols-3 [font-variant-numeric:tabular-nums]">
        <div className="border-r border-white/[.08] p-[13px_12px_13px_14px]">
          <div className="font-ui text-[9px] font-bold tracking-[.13em] text-[#7b828c]">
            HRV
          </div>
          <div className="mt-[6px] flex items-baseline gap-[5px]">
            <span className="font-num text-[19px] tracking-[-.01em] text-white">{hrv}</span>
            {/* V1 COMPAT: static grey (design v2 kills alarm-colored deltas); re-port in R5-R7. */}
            <span className="font-num text-[10px] font-semibold text-[#9aa0a7]">
              {formatSignedPct(hrvDeltaPct)}
            </span>
          </div>
        </div>
        <div className="border-r border-white/[.08] p-[13px_12px]">
          <div className="font-ui text-[9px] font-bold tracking-[.13em] text-[#7b828c]">
            RESTING HR
          </div>
          <div className="mt-[6px] flex items-baseline gap-[5px]">
            <span className="font-num text-[19px] tracking-[-.01em] text-white">{rhr}</span>
            <span className="font-num text-[10px] font-semibold text-[#FF9A3D]">
              {formatSignedInt(rhrDelta)}
            </span>
          </div>
        </div>
        <div className="p-[13px_14px_13px_12px]">
          <div className="font-ui text-[9px] font-bold tracking-[.13em] text-[#7b828c]">
            RESP RATE
          </div>
          <div className="mt-[6px] flex items-baseline gap-[5px]">
            <span className="font-num text-[19px] tracking-[-.01em] text-white">
              {respRate}
            </span>
            <span className="font-num text-[10px] font-semibold text-[#7b828c]">br</span>
          </div>
        </div>
      </div>
      <div className="border-t border-white/[.06] p-[8px_14px_14px]">
        <Sparkline points={hrv14d} color="#7CB3D9" height={42} />
      </div>
    </div>
  );
}
