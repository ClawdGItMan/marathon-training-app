import type {
  ChatMessage,
  PainArea,
  PlannedSession,
  Prediction,
  Proposal,
  RaceGoal,
  RecoverySnapshot,
  StrengthExercise,
  TrainingBlock,
} from "@/lib/domain/types";

export type ProposalDecision = "accepted" | "modified" | "dismissed";

export type StrengthSession = {
  phase: string;
  note: string;
  session: StrengthExercise[];
};

export type LogRunEntry = {
  sessionId?: string;
  rpe: number;
  painAreaId?: string;
  painSeverity?: number;
};

/**
 * Repo is the single data-access surface for the app. Phase 1 is backed by
 * `localRepo` (seed data + localStorage overlay); Phase 2 swaps in a
 * Supabase-backed implementation behind this same interface. Every method
 * is async and returns domain types (see src/lib/domain/types.ts), even
 * though Phase 1 is synchronous under the hood.
 */
export interface Repo {
  getGoal(): Promise<RaceGoal>;
  getBlock(): Promise<TrainingBlock>;
  getLatestRecovery(): Promise<RecoverySnapshot>;
  getRecovery7d(): Promise<RecoverySnapshot[]>;
  getWeekSessions(): Promise<PlannedSession[]>;
  getSession(id: string): Promise<PlannedSession>;
  getOpenProposals(): Promise<Proposal[]>;
  decideProposal(
    id: string,
    decision: ProposalDecision,
    edited?: PlannedSession
  ): Promise<void>;
  getPains(): Promise<PainArea[]>;
  logPain(areaId: string, severity: number, note?: string): Promise<void>;
  getPredictions(): Promise<Prediction[]>;
  getStrengthSession(): Promise<StrengthSession>;
  getCoachThread(): Promise<ChatMessage[]>;
  appendChat(msg: ChatMessage): Promise<void>;
  logRun(entry: LogRunEntry): Promise<void>;
}
