"use client";

import { useEffect, useState } from "react";
import { repo } from "@/lib/data";
import { seed } from "@/lib/data/seed";
import { PageHeader } from "@/components/shell/PageHeader";
import { Section } from "@/components/ui/Section";
import { StreakIndicator } from "@/components/progress/StreakIndicator";
import { RangeTabs, type Range } from "@/components/progress/RangeTabs";
import { FocusCard } from "@/components/progress/FocusCard";
import { WeekRunCard } from "@/components/progress/WeekRunCard";
import { PredictionsCard } from "@/components/progress/PredictionsCard";
import type { Prediction, RaceGoal } from "@/lib/domain/types";

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
};

async function loadProgressState(): Promise<ProgressState> {
  const [goal, predictions] = await Promise.all([
    repo.getGoal(),
    repo.getPredictions(),
  ]);

  return {
    goal,
    predictions,
    mileage12wk: seed.mileage12wk,
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

  const { goal, predictions, mileage12wk } = state;
  const weekMileage = sliceMileage(mileage12wk, selectedRange);
  const xLabels = X_LABELS[selectedRange];

  return (
    <div className="pb-6">
      <PageHeader title="Progress" right={<StreakIndicator streak={goal.streak} />} from="progress" />

      <RangeTabs value={selectedRange} onChange={setSelectedRange} />

      <div className="px-[22px] pt-[18px]">
        <FocusCard goal={goal} />
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section header={{ label: "THIS WEEK · RUN" }}>
          <WeekRunCard mileage={weekMileage} xLabels={xLabels} />
        </Section>
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section header={{ label: "PREDICTIONS", context: "30-DAY TREND" }}>
          <PredictionsCard predictions={predictions} goal={goal} />
        </Section>
      </div>
    </div>
  );
}
