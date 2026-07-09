import { ProgressTicks } from "@/components/ui/ProgressTicks";
import type { RaceGoal } from "@/lib/domain/types";

function formatRaceDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Instrument YOUR FOCUS row: race name + block ticks on the left, race date +
 * weeks-left on the right, closed by a hairline. Design ref:
 * design-v2/Daily Screen Directions.dc.html #7b (lines ~174-177).
 */
export function FocusCard({ goal }: { goal: RaceGoal }) {
  const weeksLeft = Math.ceil(goal.daysOut / 7);

  return (
    <div className="hairline flex items-start justify-between pb-[16px]">
      <div>
        <div className="font-mono text-[9.5px] uppercase tracking-[.18em] text-[#9aa0a7]">
          YOUR FOCUS
        </div>
        <div className="mt-[7px] font-display text-[19px] text-white">{goal.name}</div>
        {/* Block week 7 of 16 — v2 canonical (#7b YOUR FOCUS ticks). */}
        <ProgressTicks done={7} total={16} />
      </div>
      <div className="text-right">
        <div className="font-num text-[17px] font-medium tabular-nums text-[#e8eaec]">
          {formatRaceDate(goal.date)}
        </div>
        <div className="mt-[4px] font-mono text-[8.5px] tracking-[.12em] text-[#5c6168]">
          {weeksLeft} WKS LEFT
        </div>
      </div>
    </div>
  );
}
