import { ProgressTicks } from "@/components/ui/ProgressTicks";
import type { RaceGoal, TrainingBlock } from "@/lib/domain/types";

function formatRaceDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Instrument YOUR FOCUS row: race name + block ticks on the left, race date +
 * weeks-left on the right, closed by a hairline. Design ref:
 * design-v2/Daily Screen Directions.dc.html #7b (lines ~174-177).
 *
 * Ticks are `block.week`/`block.totalWeeks` (Task 11) — real DB columns
 * (`blocks.week`/`blocks.total_weeks`, not payload/seed-derived) rather than
 * the previous hardcoded `done={7} total={16}`, which happened to match the
 * current seed data's block exactly (week 7 of 16) but wasn't wired to it.
 */
export function FocusCard({ goal, block }: { goal: RaceGoal; block: TrainingBlock }) {
  const weeksLeft = Math.ceil(goal.daysOut / 7);

  return (
    <div className="hairline flex items-start justify-between pb-[16px]">
      <div>
        <div className="font-mono text-[9.5px] uppercase tracking-[.18em] text-[#9aa0a7]">
          YOUR FOCUS
        </div>
        <div className="mt-[7px] font-display text-[19px] text-white">{goal.name}</div>
        <ProgressTicks done={block.week} total={block.totalWeeks} />
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
