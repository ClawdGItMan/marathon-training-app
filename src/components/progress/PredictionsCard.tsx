import { formatClock, formatDeltaMSS, formatGoalHM, formatPace } from "@/lib/format";
import type { Prediction, RaceGoal } from "@/lib/domain/types";

/** Strip the leading "0:" hour segment formatClock adds for sub-1-hour times. */
function formatRaceTime(sec: number): string {
  return formatClock(sec).replace(/^0:/, "");
}

const DISTANCE_LABEL: Record<Prediction["distance"], string> = {
  "5K": "5K",
  "10K": "10K",
  HALF: "Half",
  FULL: "Full",
};

function PredictionRow({
  prediction,
  mid,
  isFirst,
  isLast,
  emphasize,
}: {
  prediction: Prediction;
  mid: string;
  isFirst: boolean;
  isLast: boolean;
  emphasize: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-[13px] pt-[13px] ${
        isFirst ? "" : "border-t border-white/[.09]"
      } ${isLast ? "pb-[15px]" : "pb-[13px]"}`}
    >
      <span
        className={`w-[38px] flex-none font-display text-[13.5px] ${
          emphasize ? "text-white" : "text-[#c3c8ce]"
        }`}
      >
        {DISTANCE_LABEL[prediction.distance]}
      </span>
      <span className="flex-1 font-num text-[10.5px] text-[#6f757d]">{mid}</span>
      <span className="font-mono text-[14px] tabular-nums text-white">
        {formatRaceTime(prediction.timeSec)}
      </span>
      <span className="w-[44px] text-right font-mono text-[10px] text-sig">
        {formatDeltaMSS(prediction.deltaSec)}
      </span>
    </div>
  );
}

/**
 * PREDICTIONS ruled rows: 5K/10K/Half plain, Full emphasized (white label) —
 * all lime mono deltas, no chips/pills. Design ref:
 * design-v2/Daily Screen Directions.dc.html #7b (lines ~198-223).
 */
export function PredictionsCard({
  predictions,
  goal,
}: {
  predictions: Prediction[];
  goal: RaceGoal;
}) {
  const rows = predictions.filter((p) => p.distance !== "FULL");
  const full = predictions.find((p) => p.distance === "FULL");

  return (
    <div>
      {rows.map((prediction, i) => (
        <PredictionRow
          key={prediction.distance}
          prediction={prediction}
          mid={`${formatPace(prediction.paceSecPerMi)} /mi`}
          isFirst={i === 0}
          isLast={false}
          emphasize={false}
        />
      ))}
      {full ? (
        <PredictionRow
          prediction={full}
          mid={`vs ${formatGoalHM(goal.goalSec)} goal`}
          isFirst={rows.length === 0}
          isLast
          emphasize
        />
      ) : null}
    </div>
  );
}
