import { groupBreakdown } from "@/lib/workout";
import type { StructureSegment } from "@/lib/domain/types";

function SegmentRow({
  segment,
  align,
  titleColor,
  durationColor,
}: {
  segment: StructureSegment;
  align: "center" | "baseline";
  titleColor: string;
  durationColor: string;
}) {
  return (
    <div className={`flex ${align === "center" ? "items-center" : "items-baseline"} justify-between gap-3`}>
      <div>
        <div className={`font-display text-[14px] ${titleColor}`}>{segment.label}</div>
        <div className="mt-[2px] font-num text-[11px] text-[#7b828c]">
          {segment.pace ? `${segment.pace} · ${segment.zone}` : segment.zone}
        </div>
      </div>
      <span className={`font-mono text-[13px] ${durationColor}`}>{segment.duration}</span>
    </div>
  );
}

/**
 * Workout Detail's BREAKDOWN section (design #6a, lines 589-606): ruled
 * rows for warm up / cool down, and a combined lime "8×" + dashed-divider
 * rep→float block for the interval set.
 */
export function BreakdownList({ structure }: { structure: StructureSegment[] }) {
  const blocks = groupBreakdown(structure);

  return (
    <div className="px-[22px] pt-5">
      <div className="whitespace-nowrap font-mono text-[10px] tracking-[.18em] text-[#9aa0a7]">
        BREAKDOWN
      </div>
      {blocks.map((block, i) => {
        const hairline = i < blocks.length - 1 ? "hairline" : "";
        if (block.kind === "single") {
          return (
            <div key={block.segment.label} className={`py-[15px] ${hairline}`}>
              <SegmentRow
                segment={block.segment}
                align="center"
                titleColor="text-[#e8eaec]"
                durationColor="text-[#9aa0a7]"
              />
            </div>
          );
        }
        return (
          <div key={block.rep.label} className={`flex gap-[14px] py-[15px] ${hairline}`}>
            <span className="flex-none pt-[1px] font-mono text-[13px] text-sig">
              {block.rep.repeat}×
            </span>
            <div className="flex-1">
              <SegmentRow
                segment={block.rep}
                align="baseline"
                titleColor="text-white"
                durationColor="text-white"
              />
              <div className="mt-3 border-t border-dashed border-white/[.12] pt-3">
                <SegmentRow
                  segment={block.float}
                  align="baseline"
                  titleColor="text-[#e8eaec]"
                  durationColor="text-[#9aa0a7]"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
