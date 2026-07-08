import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { formatClock } from "@/lib/format";
import type { Prediction, RaceGoal, TrainingBlock } from "@/lib/domain/types";

/** 14400 → "4:00" (goal time in h:mm). */
function formatGoalHM(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** −132 → "−2:12" (prediction delta, U+2212 minus per design #7b). */
function formatDeltaMSS(deltaSec: number): string {
  const abs = Math.abs(deltaSec);
  const sign = deltaSec < 0 ? "−" : "+";
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Bottom-of-Today glance lines as Instrument ruled sections:
 * THIS WEEK (mileage context + long run row → /plan) and
 * PREDICTED (#7b Full row: vs-goal, time, lime delta → /progress).
 */
export function GlanceLines({
  goal,
  block,
  fullPrediction,
}: {
  goal: RaceGoal;
  block: TrainingBlock;
  fullPrediction?: Prediction;
}) {
  return (
    <>
      <div className="px-[22px] pt-[18px]">
        <Section
          header={{
            label: "THIS WEEK",
            context: `${block.weekMilesDone} / ${block.weekMilesTarget} MI`,
            contextHref: "/plan",
          }}
        >
          <Link href="/plan" className="flex items-center gap-[13px] py-[13px]">
            <span className="flex-1 font-display text-[13.5px] text-[#c3c8ce]">Long run</span>
            <span className="whitespace-nowrap font-mono text-[9px] tracking-[.1em] text-[#5c6168]">
              {block.longRunLabel}
            </span>
          </Link>
        </Section>
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section
          header={{ label: "PREDICTED", context: "30-DAY TREND →", contextHref: "/progress" }}
        >
          <Link href="/progress" className="flex items-center gap-[13px] py-[13px]">
            <span className="flex-1 font-num text-[10.5px] text-[#6f757d]">
              vs {formatGoalHM(goal.goalSec)} goal
            </span>
            <span className="font-mono text-[14px] tabular-nums text-white">
              {formatClock(goal.predictedSec)}
            </span>
            {fullPrediction ? (
              <span className="w-[44px] text-right font-mono text-[10px] text-sig">
                {formatDeltaMSS(fullPrediction.deltaSec)}
              </span>
            ) : null}
          </Link>
        </Section>
      </div>
    </>
  );
}
