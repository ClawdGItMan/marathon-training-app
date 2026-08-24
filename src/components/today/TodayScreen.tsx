"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { repo } from "@/lib/data";
import { resolveTodaySessionId } from "@/lib/data/today";
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
import { WriteErrorLine } from "@/components/ui/WriteErrorLine";
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
    repo.getGoal(),
    repo.getLatestRecovery(),
    repo.getBlock(),
    repo.getWeekSessions(),
    repo.getOpenProposals(),
    repo.getPredictions(),
  ]);

  // I2: resolve today BY DATE (home tz) with the static seed id as fallback
  // (src/lib/data/today.ts) instead of deriving it from recovery.date —
  // pre-first-sync, recovery.date is the seed's last demo day, which
  // post-reanchor matches nothing and used to mis-select week[0]. Local
  // mode is unchanged: no live date matches the frozen demo week, and the
  // fallback (wed-400s) is exactly what recovery.date used to select.
  const todayId = resolveTodaySessionId(week, new Date());
  const todaySession = week.find((s) => s.id === todayId) ?? week[0];
  const dayProposal = proposals.find(
    (p) => p.scope === "day" && p.targetSessionId === todaySession.id
  );
  const fullPrediction = predictions.find((p) => p.distance === "FULL");

  return { goal, recovery, block, todaySession, dayProposal, fullPrediction };
}

export function TodayScreen() {
  const [state, setState] = useState<TodayState | null>(null);
  const [writeError, setWriteError] = useState<unknown>(null);

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

  // I4: a rejected decide renders one calm inline line under the
  // recommendation box (which stays visible — the proposal is undecided)
  // instead of an unhandled rejection; a retry that succeeds clears it.
  const handleDecide = useCallback(
    async (proposalId: string, decision: ProposalDecision, edited?: PlannedSession) => {
      try {
        await repo.decideProposal(proposalId, decision, edited);
        const next = await loadTodayState();
        setState(next);
        setWriteError(null);
      } catch (err) {
        setWriteError(err);
      }
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
            href="/settings?from=today"
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
        <>
          <RecommendationBox
            proposal={dayProposal}
            onDecide={(decision, edited) => handleDecide(dayProposal.id, decision, edited)}
          />
          <div className="px-[22px]">
            <WriteErrorLine error={writeError} />
          </div>
        </>
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
