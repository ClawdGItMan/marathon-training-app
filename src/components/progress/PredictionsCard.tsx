import { formatClock, formatHM, formatPace } from "@/lib/format";
import type { Prediction, RaceGoal } from "@/lib/domain/types";

function formatDelta(deltaSec: number): string {
  const abs = Math.abs(deltaSec);
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Strip the leading "0:" hour segment formatClock adds for sub-1-hour times. */
function formatRaceTime(sec: number): string {
  return formatClock(sec).replace(/^0:/, "");
}

const CHIP_LABEL: Record<Prediction["distance"], string> = {
  "5K": "5K",
  "10K": "10K",
  HALF: "HALF",
  FULL: "FULL",
};

function PredictionRow({
  prediction,
  isFirst,
}: {
  prediction: Prediction;
  isFirst: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-[11px] ${
        isFirst ? "" : "border-t border-white/[.06]"
      }`}
    >
      <div className="flex h-[30px] w-[42px] flex-none items-center justify-center rounded-ctl bg-white/[.05]">
        <span className="font-ui text-[11px] font-extrabold text-[#9aa1ab]">
          {CHIP_LABEL[prediction.distance]}
        </span>
      </div>
      <div className="flex-1">
        <div className="font-num text-[17px] font-medium tracking-[-.01em] text-white">
          {formatRaceTime(prediction.timeSec)}
        </div>
        <div className="mt-[1px] font-ui text-[11px] font-medium text-[#8a919c]">
          {formatPace(prediction.paceSecPerMi)} /mi
        </div>
      </div>
      <span className="font-num text-[11px] font-bold text-[#16e06a]">
        ▼ {formatDelta(prediction.deltaSec)}
      </span>
    </div>
  );
}

function FullRow({ prediction, goal }: { prediction: Prediction; goal: RaceGoal }) {
  return (
    <div className="mt-[6px] flex items-center gap-3 rounded-ctl bg-[rgba(56,102,224,.08)] p-[13px_11px]">
      <div className="flex h-[32px] w-[42px] flex-none items-center justify-center rounded-ctl bg-accent">
        <span className="font-ui text-[9px] font-extrabold tracking-[.04em] text-white">
          FULL
        </span>
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-num text-[19px] font-medium tracking-[-.01em] text-white">
            {formatRaceTime(prediction.timeSec)}
          </span>
          <span className="font-ui text-[10px] font-bold text-[#16e06a]">
            vs {formatHM(goal.goalSec / 60)} goal
          </span>
        </div>
        <div className="mt-[1px] font-ui text-[11px] font-medium text-[#8a919c]">
          {formatPace(prediction.paceSecPerMi)} /mi · on track
        </div>
      </div>
      <span className="font-num text-[11px] font-bold text-[#16e06a]">
        ▼ {formatDelta(prediction.deltaSec)}
      </span>
    </div>
  );
}

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
    <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[4px_15px_8px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      {rows.map((prediction, i) => (
        <PredictionRow key={prediction.distance} prediction={prediction} isFirst={i === 0} />
      ))}
      {full ? <FullRow prediction={full} goal={goal} /> : null}
    </div>
  );
}
