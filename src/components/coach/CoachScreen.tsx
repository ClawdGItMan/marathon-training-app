"use client";

import { useCallback, useEffect, useState } from "react";
import { localRepo } from "@/lib/data/local-repo";
import type { ProposalDecision } from "@/lib/data/repo";
import type { ChatMessage, Proposal, RecoverySnapshot, TrainingBlock } from "@/lib/domain/types";
import { CoachHeader } from "@/components/coach/CoachHeader";
import { Transcript } from "@/components/coach/Transcript";
import { Composer } from "@/components/coach/Composer";
import { chatTime, OFFLINE_REPLY, resolveCoachOrigin } from "@/lib/coach";
import { formatDayContext, formatWeekOf } from "@/lib/format";

type CoachState = {
  recovery: RecoverySnapshot;
  block: TrainingBlock;
  thread: ChatMessage[];
  openProposals: Proposal[];
};

async function loadCoachState(): Promise<CoachState> {
  const [recovery, block, thread, openProposals] = await Promise.all([
    localRepo.getLatestRecovery(),
    localRepo.getBlock(),
    localRepo.getCoachThread(),
    localRepo.getOpenProposals(),
  ]);
  return { recovery, block, thread, openProposals };
}

/**
 * Coach screen (design #7f) — what every ASK COACH chip opens. Uses the
 * (tabs) route group / AppShell like every other screen, so the tab bar
 * still renders (design shows it, just with no tab active since Coach
 * isn't one of the five). Header, transcript, and composer are split into
 * their own files to stay under the 150-line ceiling.
 */
export function CoachScreen({ from }: { from?: string }) {
  const [state, setState] = useState<CoachState | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    setState(await loadCoachState());
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCoachState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDecide = useCallback(
    async (proposalId: string, decision: ProposalDecision) => {
      await localRepo.decideProposal(proposalId, decision);
      await refresh();
    },
    [refresh]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await localRepo.appendChat({ id: crypto.randomUUID(), role: "user", text: trimmed });
      await localRepo.appendChat({
        id: crypto.randomUUID(),
        role: "coach",
        text: OFFLINE_REPLY,
        time: chatTime(),
      });
      await refresh();
    },
    [refresh]
  );

  const handleSend = useCallback(() => {
    const text = draft;
    setDraft("");
    void send(text);
  }, [draft, send]);

  const handlePrompt = useCallback((label: string) => void send(label), [send]);

  if (!state) return null;
  const { recovery, block, thread, openProposals } = state;
  const { backHref, contextLabel } = resolveCoachOrigin(from);

  return (
    <div className="flex min-h-full flex-col pb-6">
      <CoachHeader backHref={backHref} dateContext={formatDayContext(recovery.date)} />

      <Transcript
        contextLabel={contextLabel}
        weekContext={formatWeekOf(block)}
        messages={thread}
        openProposals={openProposals}
        onDecide={handleDecide}
      />

      <Composer value={draft} onChange={setDraft} onSend={handleSend} onPrompt={handlePrompt} />
    </div>
  );
}
