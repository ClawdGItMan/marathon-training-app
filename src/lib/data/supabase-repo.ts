import { getBrowserClient } from "@/lib/supabase/browser";
import { seed } from "@/lib/data/seed";
import {
  rowToBlock,
  rowToChatMessage,
  rowToGoal,
  rowToPainArea,
  rowToProposal,
  rowToRecovery,
  rowToSession,
} from "@/lib/data/row-mappers";
import type {
  ChatMessage,
  PainArea,
  PlannedSession,
  Prediction,
  Proposal,
  RaceGoal,
  RecoverySnapshot,
  TrainingBlock,
} from "@/lib/domain/types";
import type { LogRunEntry, ProposalDecision, Repo, StrengthSession } from "@/lib/data/repo";

/**
 * Supabase-backed Repo implementation. READ methods only this task — every
 * write method throws until Task 4 wires decideProposal/startSession/
 * logPain/appendChat/logRun as RPCs/mutations against the RLS-scoped
 * browser client. All queries run through `getBrowserClient()` (never
 * service-role), so RLS governs every row exactly as it does for the real
 * signed-in user.
 */

function notImplemented(method: string): never {
  throw new Error(`not implemented until task 4: ${method}`);
}

async function getGoal(): Promise<RaceGoal> {
  const { data, error } = await getBrowserClient().from("goals").select("*").single();
  if (error) throw error;
  return rowToGoal(data);
}

async function getBlock(): Promise<TrainingBlock> {
  const { data, error } = await getBrowserClient().from("blocks").select("*").single();
  if (error) throw error;
  return rowToBlock(data);
}

async function getRecovery7d(): Promise<RecoverySnapshot[]> {
  const { data, error } = await getBrowserClient()
    .from("recovery_snapshots")
    .select("*")
    .order("day", { ascending: true })
    .limit(7);
  if (error) throw error;
  return data.map(rowToRecovery);
}

async function getLatestRecovery(): Promise<RecoverySnapshot> {
  const { data, error } = await getBrowserClient()
    .from("recovery_snapshots")
    .select("*")
    .order("day", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return rowToRecovery(data);
}

async function getWeekSessions(): Promise<PlannedSession[]> {
  const { data, error } = await getBrowserClient()
    .from("planned_sessions")
    .select("*")
    .order("date", { ascending: true });
  if (error) throw error;
  return data.map(rowToSession);
}

async function getSession(id: string): Promise<PlannedSession> {
  const client = getBrowserClient();

  const { data, error } = await client.from("planned_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (data) return rowToSession(data);

  // Moved-session dual-id (F3): an accepted/modified proposal can change a
  // session's id (e.g. proposal-2: sun-long -> sat-long-moved). Once Task 4
  // implements decideProposal, the resulting row carries
  // payload.movedFromId = <old id> so callers can resolve under either id.
  // No seeded row has this field pre-decision, so this path is exercised by
  // Task 4's parity un-skip, not by any Task-3 seed data.
  const { data: moved, error: movedError } = await client
    .from("planned_sessions")
    .select("*")
    .eq("payload->>movedFromId", id)
    .maybeSingle();
  if (movedError) throw movedError;
  if (!moved) throw new Error(`Unknown session: ${id}`);
  return rowToSession(moved);
}

async function startSession(_id: string): Promise<void> {
  notImplemented("startSession");
}

async function getOpenProposals(): Promise<Proposal[]> {
  const { data, error } = await getBrowserClient().from("proposals").select("*").eq("status", "proposed");
  if (error) throw error;
  return data.map(rowToProposal);
}

async function decideProposal(
  _id: string,
  _decision: ProposalDecision,
  _edited?: PlannedSession
): Promise<void> {
  notImplemented("decideProposal");
}

async function getPains(): Promise<PainArea[]> {
  const { data, error } = await getBrowserClient().from("pain_areas").select("*");
  if (error) throw error;
  return data.map(rowToPainArea);
}

async function logPain(_areaId: string, _severity: number, _note?: string): Promise<void> {
  notImplemented("logPain");
}

// Predictions have no backing table in the Task-1/Task-3 DDL — the spec
// marks predicted-time content as still-seeded/derived until Phase 3, so
// this reads the static seed module directly. seed-derived until Phase 3.
async function getPredictions(): Promise<Prediction[]> {
  return seed.predictions;
}

// Same as getPredictions: strength programming has no table yet.
// seed-derived until Phase 3.
async function getStrengthSession(): Promise<StrengthSession> {
  return seed.strength;
}

async function getCoachThread(): Promise<ChatMessage[]> {
  const { data, error } = await getBrowserClient()
    .from("chat_messages")
    .select("*")
    .order("seq", { ascending: true });
  if (error) throw error;
  return data.map(rowToChatMessage);
}

async function appendChat(_msg: ChatMessage): Promise<void> {
  notImplemented("appendChat");
}

async function logRun(_entry: LogRunEntry): Promise<void> {
  notImplemented("logRun");
}

export const supabaseRepo: Repo = {
  getGoal,
  getBlock,
  getLatestRecovery,
  getRecovery7d,
  getWeekSessions,
  getSession,
  startSession,
  getOpenProposals,
  decideProposal,
  getPains,
  logPain,
  getPredictions,
  getStrengthSession,
  getCoachThread,
  appendChat,
  logRun,
};
