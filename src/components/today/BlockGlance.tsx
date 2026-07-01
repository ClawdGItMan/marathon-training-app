import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProgressTicks } from "@/components/ui/ProgressTicks";
import type { TrainingBlock } from "@/lib/domain/types";

export function BlockGlance({ block }: { block: TrainingBlock }) {
  return (
    <>
      <SectionHeader
        label="TRAINING BLOCK"
        accent="#7CB3D9"
        action="PLAN ›"
        actionHref="/plan"
        actionAriaLabel="View training block schedule"
      />
      <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[16px_15px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
        <div className="flex items-baseline justify-between">
          <span className="font-ui text-[15px] font-bold text-white">
            BLOCK {block.number} · {block.phase}
          </span>
          <span className="font-ui text-[11px] font-semibold text-[#8a919c]">
            WEEK {block.week} / {block.totalWeeks}
          </span>
        </div>

        <ProgressTicks done={block.week} total={block.totalWeeks} current />

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="font-ui text-[10px] font-bold tracking-[.1em] text-[#8a919c]">
              THIS WEEK
            </div>
            <div className="mt-1 font-num text-[22px] tracking-[-.01em] text-white">
              {block.weekMilesDone}{" "}
              <span className="text-[13px] font-medium text-[#7b828c]">
                / {block.weekMilesTarget} mi
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-ui text-[10px] font-bold tracking-[.1em] text-[#8a919c]">
              LONG RUN
            </div>
            <div className="mt-[6px] font-ui text-[16px] font-bold text-white">
              {block.longRunLabel}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
