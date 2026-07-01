import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatClock } from "@/lib/format";
import type { RaceGoal } from "@/lib/domain/types";

export function ProgressGlimpse({
  goal,
  mileage12wk,
}: {
  goal: RaceGoal;
  mileage12wk: number[];
}) {
  const predicted = formatClock(goal.predictedSec);
  const goalTime = formatClock(goal.goalSec);
  const underByMin = Math.round((goal.goalSec - goal.predictedSec) / 60);
  const currentWeekMiles = mileage12wk.at(-1) ?? 0;

  return (
    <>
      <SectionHeader label="PROGRESS" accent="#16e06a" action="SEE ALL ›" actionHref="/progress" />
      <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[15px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-ui text-[10px] font-bold tracking-[.12em] text-[#7b828c]">
              PREDICTED MARATHON
            </div>
            <div className="mt-[6px] flex items-baseline gap-[9px]">
              <span className="font-num text-[28px] tracking-[-.01em] text-white">
                {predicted.replace(/^0:/, "")}
              </span>
              <span className="font-ui text-[11px] font-bold text-[#16e06a]">
                {underByMin} min under goal
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-ui text-[10px] font-bold tracking-[.1em] text-[#7b828c]">
              GOAL
            </div>
            <div className="mt-[3px] font-num text-[16px] text-[#9aa1ab]">
              {goalTime.replace(/^0:/, "")}
            </div>
          </div>
        </div>

        <div className="mt-[14px] flex items-end gap-3 border-t border-white/[.06] pt-[13px]">
          <div className="flex-none">
            <div className="font-ui text-[9px] font-bold tracking-[.1em] text-[#7b828c]">
              12-WK MILEAGE
            </div>
            <div className="mt-[3px] font-num text-[14px] text-white">
              {currentWeekMiles} mi
            </div>
          </div>
          <div className="flex-1">
            <Sparkline points={mileage12wk} color="#16e06a" height={34} />
          </div>
        </div>
      </div>
    </>
  );
}
