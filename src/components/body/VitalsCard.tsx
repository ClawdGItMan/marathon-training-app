import { Sparkline } from "@/components/charts/Sparkline";

function formatSignedPct(pct: number): string {
  return `${pct > 0 ? "↑" : "↓"}${Math.abs(pct)}%`;
}

function formatSignedInt(delta: number): string {
  return delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : `${delta}`;
}

/**
 * VITALS body per design #7c (lines ~269-278): three value-first stats (no
 * column rules, 26px gap) with grey deltas — never alarm-colored — then a
 * grey sparkline with a lime "now" endpoint. Closed with a hairline rule
 * (pb-16 here; Section supplies the rule itself).
 */
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
    <div className="pb-[16px]">
      <div className="mt-[12px] flex gap-[26px] [font-variant-numeric:tabular-nums]">
        <div>
          <div className="font-num text-[17px] tracking-[-.01em] text-[#e8eaec]">
            {hrv}
            <span className="font-mono text-[10px] text-[#9aa0a7]"> {formatSignedPct(hrvDeltaPct)}</span>
          </div>
          <div className="mt-[4px] whitespace-nowrap font-mono text-[8.5px] tracking-[.14em] text-[#5c6168]">
            HRV
          </div>
        </div>
        <div>
          <div className="font-num text-[17px] tracking-[-.01em] text-[#e8eaec]">
            {rhr}
            <span className="font-mono text-[10px] text-[#9aa0a7]"> {formatSignedInt(rhrDelta)}</span>
          </div>
          <div className="mt-[4px] whitespace-nowrap font-mono text-[8.5px] tracking-[.14em] text-[#5c6168]">
            RESTING HR
          </div>
        </div>
        <div>
          <div className="font-num text-[17px] tracking-[-.01em] text-[#e8eaec]">
            {respRate}
            <span className="text-[11px] text-[#7b828c]"> br</span>
          </div>
          <div className="mt-[4px] whitespace-nowrap font-mono text-[8.5px] tracking-[.14em] text-[#5c6168]">
            RESP RATE
          </div>
        </div>
      </div>
      <div className="mt-[12px]">
        <Sparkline points={hrv14d} color="#565b62" height={40} endDotColor="#C9F53F" />
      </div>
    </div>
  );
}
