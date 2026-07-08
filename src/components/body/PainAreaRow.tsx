import { SegmentMeter } from "@/components/ui/SegmentMeter";
import type { PainArea } from "@/lib/domain/types";

/**
 * PAIN & INJURIES row — carried feature with no v2 mock (spec §3), composed
 * from Instrument patterns per the brief: mono name, tabular n/10 numeral,
 * white-filled segment meter (severity, distinct from the lime "now" meter
 * elsewhere), mono trend line (improving → lime "now/act" signal, otherwise
 * grey — never the v1 orange/green).
 */
export function PainAreaRow({
  area,
  selected,
  divider,
}: {
  area: PainArea;
  selected?: boolean;
  divider?: boolean;
}) {
  const trendColor = area.trend === "improving" ? "#C9F53F" : "#8a919c";
  const trendArrow = area.trend === "improving" ? "↓ " : area.trend === "worsening" ? "↑ " : "";

  return (
    <div
      data-selected={selected ?? false}
      className={
        divider
          ? "hairline-top flex items-center justify-between pt-3 mt-3"
          : "flex items-center justify-between"
      }
    >
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[.12em] text-[#9aa0a7]">
          {area.name.toUpperCase()} · {area.side?.toUpperCase()}
        </div>
        <div className="mt-1 flex items-baseline gap-[6px] [font-variant-numeric:tabular-nums]">
          <span className="font-num text-[20px] tracking-[-.01em] text-white">
            {area.severity}
          </span>
          <span className="font-num text-[11px] text-[#6f757d]">/10</span>
          <span className="font-mono text-[9px] tracking-[.08em] text-[#8a919c]">
            {area.label}
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="flex w-[92px] justify-end">
          <SegmentMeter value={area.severity} color="#fff" />
        </div>
        <div
          className="mt-[6px] font-mono text-[9px] tracking-[.08em]"
          style={{ color: trendColor }}
        >
          {trendArrow}
          {area.trend} · {area.trendDays}d
        </div>
      </div>
    </div>
  );
}
