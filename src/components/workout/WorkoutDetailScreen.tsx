"use client";

import { useCallback, useEffect, useState } from "react";
import { repo } from "@/lib/data";
import type { ProposalDecision } from "@/lib/data/repo";
import type { PlannedSession, Proposal, TrainingBlock } from "@/lib/domain/types";
import { WorkoutHeader } from "@/components/workout/WorkoutHeader";
import { WorkoutHero } from "@/components/workout/WorkoutHero";
import { BreakdownList } from "@/components/workout/BreakdownList";
import { CoachSuggestBox } from "@/components/workout/CoachSuggestBox";
import { WriteErrorLine } from "@/components/ui/WriteErrorLine";
import { formatDayContext, formatWeekOf } from "@/lib/format";

type WorkoutState = {
  session: PlannedSession;
  block: TrainingBlock;
  proposal?: Proposal;
};

async function loadWorkoutState(id: string): Promise<WorkoutState> {
  const [session, block, proposals] = await Promise.all([
    repo.getSession(id),
    repo.getBlock(),
    repo.getOpenProposals(),
  ]);
  const proposal = proposals.find((p) => p.scope === "workout" && p.targetSessionId === id);
  return { session, block, proposal };
}

/**
 * Workout Detail screen (design #6a): back header, hero, BREAKDOWN, the
 * optional COACH SUGGESTS swap, and the START WORKOUT CTA. Uses AppShell
 * ((tabs) route group) so the tab bar renders with PLAN active.
 */
export function WorkoutDetailScreen({ sessionId, from }: { sessionId: string; from?: string }) {
  const [state, setState] = useState<WorkoutState | null>(null);
  // I4: one error state per write control, each rendered adjacent to its
  // trigger (decide -> under COACH SUGGESTS; start -> under START WORKOUT);
  // success on retry clears the corresponding line.
  const [decideError, setDecideError] = useState<unknown>(null);
  const [startError, setStartError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    const next = await loadWorkoutState(sessionId);
    setState(next);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    loadWorkoutState(sessionId).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleDecide = useCallback(
    async (proposalId: string, decision: ProposalDecision) => {
      try {
        await repo.decideProposal(proposalId, decision);
        await refresh();
        setDecideError(null);
      } catch (err) {
        setDecideError(err);
      }
    },
    [refresh]
  );

  const handleStart = useCallback(async () => {
    try {
      await repo.startSession(sessionId);
      await refresh();
      setStartError(null);
    } catch (err) {
      setStartError(err);
    }
  }, [refresh, sessionId]);

  if (!state) return null;
  const { session, block, proposal } = state;

  return (
    <div className="pb-6">
      <WorkoutHeader from={from} context={`${formatDayContext(session.date)} · ${formatWeekOf(block)}`} />

      <WorkoutHero session={session} />

      {session.structure ? <BreakdownList structure={session.structure} /> : null}

      {proposal ? (
        <>
          <CoachSuggestBox
            proposal={proposal}
            onDecide={(decision) => handleDecide(proposal.id, decision)}
          />
          <div className="px-[22px]">
            <WriteErrorLine error={decideError} />
          </div>
        </>
      ) : null}

      <div className="px-[22px] pb-1 pt-[18px]">
        <button
          onClick={handleStart}
          className="h-[50px] w-full rounded-[2px] bg-sig font-display text-[13px] font-semibold tracking-[.06em] uppercase text-[#0B0C0E]"
        >
          START WORKOUT
        </button>
        <WriteErrorLine error={startError} />
      </div>
    </div>
  );
}
