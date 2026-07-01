import { SegmentMeter } from "@/components/ui/SegmentMeter";
import type { PainArea } from "@/lib/domain/types";

const LABEL_COLOR: Record<string, string> = {
  mild: "#E8A33A",
};

export function PainAreaRow({
  area,
  selected,
  divider,
}: {
  area: PainArea;
  selected?: boolean;
  divider?: boolean;
}) {
  const trendColor = area.trend === "improving" ? "#16e06a" : "#8a919c";
  const trendArrow = area.trend === "improving" ? "↓ " : area.trend === "worsening" ? "↑ " : "";
  const labelColor = LABEL_COLOR[area.label] ?? "#8a919c";

  return (
    <div
      data-selected={selected ?? false}
      className={
        divider
          ? "flex items-center justify-between border-t border-white/[.06] pt-3 mt-3"
          : "flex items-center justify-between"
      }
    >
      <div>
        <div className="font-ui text-[10px] font-bold tracking-[.1em] text-[#8a919c]">
          {area.name.toUpperCase()} · {area.side?.toUpperCase()}
        </div>
        <div className="mt-1 font-num text-[20px] tracking-[-.01em] text-white">
          {area.severity}{" "}
          <span className="text-[11px] font-medium text-[#7b828c]">/10</span>{" "}
          <span className="font-ui text-[11px] font-bold" style={{ color: labelColor }}>
            {area.label}
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="flex justify-end">
          <SegmentMeter value={area.severity} color="#FF9A3D" />
        </div>
        <div className="mt-[6px] font-ui text-[10px] font-bold" style={{ color: trendColor }}>
          {trendArrow}
          {area.trend} · {area.trendDays} days
        </div>
      </div>
    </div>
  );
}
