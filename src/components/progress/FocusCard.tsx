import { ProgressTicks } from "@/components/ui/ProgressTicks";
import type { RaceGoal } from "@/lib/domain/types";

function formatRaceDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function FocusCard({ goal }: { goal: RaceGoal }) {
  const weeksLeft = Math.ceil(goal.daysOut / 7);

  return (
    <div className="mx-4 mt-3 rounded-card border border-white/[.05] bg-[#171c23] p-[15px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-ui text-[10px] font-bold tracking-[.13em] text-accent">
            YOUR FOCUS
          </div>
          <div className="mt-[5px] font-ui text-[17px] font-bold text-white">
            {goal.name}
          </div>
        </div>
        <div className="text-right">
          <div className="font-num text-[14px] font-medium text-white">
            {formatRaceDate(goal.date)}
          </div>
          <div className="mt-[1px] font-ui text-[10px] font-semibold text-[#7b828c]">
            {weeksLeft} WEEKS LEFT
          </div>
        </div>
      </div>
      {/* Block week 7 of 16 — v2 canonical (#7b YOUR FOCUS ticks). */}
      <ProgressTicks done={7} total={16} />
    </div>
  );
}
