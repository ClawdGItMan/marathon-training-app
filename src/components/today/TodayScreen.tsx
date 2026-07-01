"use client";

import { useCallback, useEffect, useState } from "react";
import { localRepo } from "@/lib/data/local-repo";
import type { ProposalDecision } from "@/lib/data/repo";
import type {
  PainArea,
  PlannedSession,
  Proposal,
  RaceGoal,
  RecoverySnapshot,
  TrainingBlock,
} from "@/lib/domain/types";
import { RaceCountdown } from "@/components/today/RaceCountdown";
import { RingsTrio } from "@/components/today/RingsTrio";
import { RecommendationCard } from "@/components/today/RecommendationCard";
import { SessionCard } from "@/components/today/SessionCard";
import { BodyGlance } from "@/components/today/BodyGlance";
import { BlockGlance } from "@/components/today/BlockGlance";
import { ProgressGlimpse } from "@/components/today/ProgressGlimpse";

type TodayState = {
  goal: RaceGoal;
  recovery: RecoverySnapshot;
  block: TrainingBlock;
  todaySession: PlannedSession;
  dayProposal?: Proposal;
  pain: PainArea;
  mileage12wk: number[];
};

async function loadTodayState(): Promise<TodayState> {
  const [goal, recovery, block, week, proposals, pains] = await Promise.all([
    localRepo.getGoal(),
    localRepo.getLatestRecovery(),
    localRepo.getBlock(),
    localRepo.getWeekSessions(),
    localRepo.getOpenProposals(),
    localRepo.getPains(),
  ]);

  const todaySession = week.find((s) => s.date === recovery.date) ?? week[0];
  const dayProposal = proposals.find(
    (p) => p.scope === "day" && p.targetSessionId === todaySession.id
  );
  const pain = pains[0];
  // Reuse the 12-wk mileage series already present in seed via a dedicated call
  // isn't part of Repo; TodayScreen derives it from the recovery load for the
  // sparkline tail — full history lives on the Progress screen.
  const recovery7d = await localRepo.getRecovery7d();
  const mileage12wk = recovery7d.map((s) => Math.round(s.load * 25));

  return { goal, recovery, block, todaySession, dayProposal, pain, mileage12wk };
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

  const { goal, recovery, block, todaySession, dayProposal, pain, mileage12wk } = state;

  return (
    <div className="bg-app pb-6">
      <RaceCountdown raceName={goal.name} daysOut={goal.daysOut} />

      <RingsTrio
        readiness={recovery.recoveryPct}
        readinessDelta={recovery.recoveryDelta}
        sleepPct={recovery.sleep.efficiencyPct}
        sleepDuration={`${Math.floor(recovery.sleep.durationMin / 60)}h ${recovery.sleep.durationMin % 60}m`}
        load={recovery.load}
        loadLabel={recovery.loadLabel}
      />

      {dayProposal ? (
        <RecommendationCard
          proposal={dayProposal}
          onDecide={(decision, edited) => handleDecide(dayProposal.id, decision, edited)}
        />
      ) : null}

      <div className="mt-[22px] mb-[10px] flex items-center justify-between px-[18px]">
        <span className="inline-flex items-center gap-[9px]">
          <span className="block h-[14px] w-[3px] rounded-[1px] bg-[#16e06a]" />
          <span className="font-ui text-[13px] font-bold tracking-[.04em] text-white">
            TODAY&apos;S SESSION
          </span>
        </span>
        <span className="font-ui text-[11px] font-semibold text-[#7b828c]">EDIT ›</span>
      </div>
      <SessionCard planned={todaySession} proposed={dayProposal?.after} />

      <div className="mt-[22px]">
        <BodyGlance pain={pain} />
      </div>

      <div className="mt-[22px]">
        <BlockGlance block={block} />
      </div>

      <div className="mt-[22px]">
        <ProgressGlimpse goal={goal} mileage12wk={mileage12wk} />
      </div>
    </div>
  );
}
