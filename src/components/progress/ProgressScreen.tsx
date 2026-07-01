"use client";

import { useEffect, useState } from "react";
import { localRepo } from "@/lib/data/local-repo";
import { seed } from "@/lib/data/seed";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FocusCard } from "@/components/progress/FocusCard";
import { WeekRunCard } from "@/components/progress/WeekRunCard";
import { PredictionsCard } from "@/components/progress/PredictionsCard";
import { FitnessCard } from "@/components/progress/FitnessCard";
import type { Prediction, RaceGoal } from "@/lib/domain/types";

type Range = "1W" | "1M" | "3M" | "1Y";

const RANGES: Range[] = ["1W", "1M", "3M", "1Y"];

const X_LABELS: Record<Range, string[]> = {
  "1W": ["THIS WK"],
  "1M": ["JUN", "JUL"],
  "3M": ["MAY", "JUN", "JUL"],
  "1Y": ["MAY", "JUN", "JUL"],
};

function sliceMileage(mileage12wk: number[], range: Range): number[] {
  switch (range) {
    case "1W":
      return mileage12wk.slice(-2);
    case "1M":
      return mileage12wk.slice(-4);
    case "3M":
    case "1Y":
      return mileage12wk;
  }
}

type ProgressState = {
  goal: RaceGoal;
  predictions: Prediction[];
  mileage12wk: number[];
  fitness90d: number[];
};

async function loadProgressState(): Promise<ProgressState> {
  const [goal, predictions] = await Promise.all([
    localRepo.getGoal(),
    localRepo.getPredictions(),
  ]);

  return {
    goal,
    predictions,
    mileage12wk: seed.mileage12wk,
    fitness90d: seed.fitness90d,
  };
}

export function ProgressScreen() {
  const [state, setState] = useState<ProgressState | null>(null);
  const [selectedRange, setSelectedRange] = useState<Range>("3M");

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const next = await loadProgressState();
      if (!cancelled) setState(next);
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const { goal, predictions, mileage12wk, fitness90d } = state;
  const weekMileage = sliceMileage(mileage12wk, selectedRange);
  const xLabels = X_LABELS[selectedRange];

  return (
    <div className="bg-app pb-6">
      <div className="flex items-center justify-between px-4 pb-1 pt-[6px]">
        <span className="inline-flex items-center gap-[10px]">
          <span className="font-ui text-[22px] font-bold tracking-[-.01em] text-white">
            Progress
          </span>
          <span className="inline-flex items-center gap-1 rounded-ctl bg-[rgba(255,154,61,.14)] px-2 py-1">
            <svg width="14" height="14" viewBox="0 -3 24 24" fill="#FF9A3D">
              <path d="M12 2c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.5.6-2.8 1.5-3.8C8.8 8.3 9 9.5 10 10c.8-2-.3-4 2-8z" />
            </svg>
            <span className="font-num text-[11px] font-bold text-[#FF9A3D]">
              {goal.streak}
            </span>
          </span>
        </span>
        <div className="flex rounded-ctl bg-white/[.05] p-[3px]">
          {RANGES.map((range) => {
            const active = range === selectedRange;
            return (
              <button
                key={range}
                type="button"
                onClick={() => setSelectedRange(range)}
                className={`rounded-ctl px-2 py-[5px] font-ui text-[10px] font-bold ${
                  active ? "bg-white/[.1] text-white" : "text-[#7b828c]"
                }`}
              >
                {range}
              </button>
            );
          })}
        </div>
      </div>

      <FocusCard goal={goal} />

      <SectionHeader label="THIS WEEK · RUN" accent="#16e06a" action="12 WEEKS ›" />
      <WeekRunCard mileage={weekMileage} xLabels={xLabels} />

      <SectionHeader label="PREDICTIONS" accent="#3866e0" action="30-DAY TREND" />
      <PredictionsCard predictions={predictions} goal={goal} />

      <SectionHeader label="FITNESS" accent="#16e06a" action="+38% · 90 days" />
      <FitnessCard fitness90d={fitness90d} />
    </div>
  );
}
