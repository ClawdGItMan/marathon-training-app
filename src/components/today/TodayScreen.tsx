"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { localRepo } from "@/lib/data/local-repo";
import type { ProposalDecision } from "@/lib/data/repo";
import type {
  PlannedSession,
  Prediction,
  Proposal,
  RaceGoal,
  RecoverySnapshot,
  TrainingBlock,
} from "@/lib/domain/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { Section } from "@/components/ui/Section";
import { GlanceLines } from "@/components/today/GlanceLines";
import { ReadinessHero } from "@/components/today/ReadinessHero";
import { RecommendationBox } from "@/components/today/RecommendationBox";
import { SessionRows } from "@/components/today/SessionRows";
import { formatDayContext } from "@/lib/format";

type TodayState = {
  goal: RaceGoal;
  recovery: RecoverySnapshot;
  block: TrainingBlock;
  todaySession: PlannedSession;
  dayProposal?: Proposal;
  fullPrediction?: Prediction;
};

async function loadTodayState(): Promise<TodayState> {
  const [goal, recovery, block, week, proposals, predictions] = await Promise.all([
    localRepo.getGoal(),
    localRepo.getLatestRecovery(),
    localRepo.getBlock(),
    localRepo.getWeekSessions(),
    localRepo.getOpenProposals(),
    localRepo.getPredictions(),
  ]);

  const todaySession = week.find((s) => s.date === recovery.date) ?? week[0];
  const dayProposal = proposals.find(
    (p) => p.scope === "day" && p.targetSessionId === todaySession.id
  );
  const fullPrediction = predictions.find((p) => p.distance === "FULL");

  return { goal, recovery, block, todaySession, dayProposal, fullPrediction };
}

export function TodayScreen() {
  const [state, setState] = useState<TodayState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const next = await loadTodayState();
      if (!cancelled) setState(next);
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDecide = useCallback(
    async (proposalId: string, decision: ProposalDecision, edited?: PlannedSession) => {
      await localRepo.decideProposal(proposalId, decision, edited);
      const next = await loadTodayState();
      setState(next);
    },
    []
  );

  if (!state) return null;

  const { goal, recovery, block, todaySession, dayProposal, fullPrediction } = state;

  return (
    <div className="pb-6">
      <PageHeader
        title="Today"
        sub={formatDayContext(todaySession.date)}
        right={
          <Link
            href="/settings"
            className="pb-[3px] font-mono text-[9.5px] tracking-[.14em] text-[#5c6168]"
          >
            SETTINGS
          </Link>
        }
        from="today"
      />

      <div className="mt-[6px]">
        <ReadinessHero recovery={recovery} />
      </div>

      {dayProposal ? (
        <RecommendationBox
          proposal={dayProposal}
          onDecide={(decision, edited) => handleDecide(dayProposal.id, decision, edited)}
        />
      ) : null}

      <div className="px-[22px] pt-[18px]">
        <Section header={{ label: "TODAY'S SESSION" }}>
          <SessionRows planned={todaySession} proposed={dayProposal?.after} />
        </Section>
      </div>

      <GlanceLines goal={goal} block={block} fullPrediction={fullPrediction} />
    </div>
  );
}
