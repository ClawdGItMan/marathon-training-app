"use client";

import { useEffect, useState } from "react";
import { repo } from "@/lib/data";
import type { StrengthSession } from "@/lib/data/repo";
import { seed } from "@/lib/data/seed";
import { resolveTodaySessionId } from "@/lib/data/today";
import { PageHeader } from "@/components/shell/PageHeader";
import { UnderlineTabs } from "@/components/ui/UnderlineTabs";
import { RunTab } from "@/components/plan/RunTab";
import { StrengthTab } from "@/components/plan/StrengthTab";
import { formatBlockSub } from "@/lib/format";
import type { PlannedSession, TrainingBlock } from "@/lib/domain/types";

const PLAN_TABS = ["RUN", "STRENGTH"] as const;
type PlanTab = (typeof PLAN_TABS)[number];

type PlanState = {
  block: TrainingBlock;
  week: PlannedSession[];
  strength: StrengthSession;
};

async function loadPlanState(): Promise<PlanState> {
  const [block, week, strength] = await Promise.all([
    repo.getBlock(),
    repo.getWeekSessions(),
    repo.getStrengthSession(),
  ]);
  return { block, week, strength };
}

/**
 * Plan screen (design-v2 #7a Plan / #7e Strength): PageHeader with the
 * block sub-line, RUN/STRENGTH underline tabs, and the two tab bodies.
 */
export function PlanScreen() {
  const [state, setState] = useState<PlanState | null>(null);
  const [tab, setTab] = useState<PlanTab>("RUN");

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const next = await loadPlanState();
      if (!cancelled) setState(next);
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const { block, week, strength } = state;

  return (
    <div className="pb-6">
      <PageHeader title="Plan" sub={formatBlockSub(block)} from="plan" />

      {/* Per design-v2 #7a/#7e: padding-top 20px, letter-spacing .16em */}
      <UnderlineTabs options={PLAN_TABS} value={tab} onChange={setTab} />

      {tab === "RUN" ? (
        <RunTab
          block={block}
          periodization={seed.periodization}
          week={week}
          // I2: the lime row is strictly "now" — resolve today by date (home
          // tz), falling back to the static seed id in local mode's frozen
          // demo week (see src/lib/data/today.ts).
          todaySessionId={resolveTodaySessionId(week, new Date())}
        />
      ) : (
        <StrengthTab strength={strength} />
      )}
    </div>
  );
}
