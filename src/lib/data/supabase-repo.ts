import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";
import { seed } from "@/lib/data/seed";
import { chatMessageSchema, sessionSchema } from "@/lib/domain/schemas";
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
 * Supabase-backed Repo implementation. All queries run through
 * `getBrowserClient()` (never service-role), so RLS governs every row
 * exactly as it does for the real signed-in user.
 *
 * Write methods (Task 4): `decideProposal` calls the `decide_proposal`
 * Postgres RPC (supabase/migrations/0003_decide_proposal.sql) — the
 * accept/modify/dismiss/expire/re-decide-guard spine is enforced server-side
 * there, not in this file. The remaining writes
 * (startSession/logPain/logRun/appendChat) are direct table
 * mutations that mirror src/lib/data/local-repo.ts's behavior exactly (see
 * each function's comment for the specific ground-truth line it mirrors).
 */

// ---- Zod arg schemas (boundary validation before any RPC/insert/update) ----
// Mirrors the pattern in local-repo.ts (proposalDecisionSchema et al.) —
// small local schemas next to the client that uses them, per the project's
// "DB/API wire schemas live next to their client" convention.

const proposalDecisionArgSchema = z.enum(["accepted", "modified", "dismissed"]);

const logRunEntrySchema = z.object({
  sessionId: z.string().optional(),
  rpe: z.number(),
  painAreaId: z.string().optional(),
  painSeverity: z.number().optional(),
});

/**
 * planned_sessions.id can be renamed by an accepted/modified proposal that
 * moves a session (decide_proposal writes payload.movedFromId = <old id> in
 * that case — see the migration). Both startSession and logRun's
 * session-status write need to resolve either id to the one row that
 * currently exists, mirroring local-repo.ts's resolveSession, which checks
 * `overlay.sessionStatusChanges[resolved.id] ?? overlay.sessionStatusChanges[originalId]`.
 */
async function updateSessionStatusByEitherId(
  client: SupabaseClient,
  id: string,
  status: "in-progress" | "completed"
): Promise<void> {
  const { data, error } = await client
    .from("planned_sessions")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (data && data.length > 0) return;

  const { error: movedError } = await client
    .from("planned_sessions")
    .update({ status })
    .eq("payload->>movedFromId", id);
  if (movedError) throw movedError;
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
  // Order descending + limit 7 to get the most recent 7 rows (not the
  // oldest 7 — matters once more than 7 rows exist, e.g. after Phase-3
  // Whoop sync), then reverse to ascending so `.at(-1)` is latest, matching
  // localRepo's `seed.recovery.slice(-7)` contract.
  const { data, error } = await getBrowserClient()
    .from("recovery_snapshots")
    .select("*")
    .order("day", { ascending: false })
    .limit(7);
  if (error) throw error;
  return data.map(rowToRecovery).reverse();
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

// Mirrors local-repo.ts startSession: `overlay.sessionStatusChanges[id] = "in-progress"`.
async function startSession(id: string): Promise<void> {
  const parsedId = z.string().min(1).parse(id);
  await updateSessionStatusByEitherId(getBrowserClient(), parsedId, "in-progress");
}

async function getOpenProposals(): Promise<Proposal[]> {
  const { data, error } = await getBrowserClient().from("proposals").select("*").eq("status", "proposed");
  if (error) throw error;
  return data.map(rowToProposal);
}

// Delegates the whole accept/modify/dismiss/expire/re-decide-guard spine to
// the server-enforced decide_proposal RPC (0003_decide_proposal.sql) rather
// than reimplementing it client-side — see that migration's comment for the
// SQL-vs-local-repo.ts reconciliation notes (payload shape, moved-session id).
async function decideProposal(
  id: string,
  decision: ProposalDecision,
  edited?: PlannedSession
): Promise<void> {
  const parsedId = z.string().min(1).parse(id);
  const parsedDecision = proposalDecisionArgSchema.parse(decision);
  const parsedEdited = edited !== undefined ? sessionSchema.parse(edited) : undefined;

  const { error } = await getBrowserClient().rpc("decide_proposal", {
    p_id: parsedId,
    p_decision: parsedDecision,
    p_modified: parsedEdited ?? null,
  });
  if (error) throw error;
}

async function getPains(): Promise<PainArea[]> {
  const { data, error } = await getBrowserClient().from("pain_areas").select("*");
  if (error) throw error;
  return data.map(rowToPainArea);
}

// Mirrors local-repo.ts logPain exactly:
// `overlay.painOverrides[areaId] = { severity, note }` — severity is always
// overwritten; the resolved read model uses `override.note ?? area.label`,
// so a note only replaces the label when one is actually supplied. `trend`
// is never touched by logPain in local-repo.ts despite the task-4 brief's
// "update pain_areas severity/trend" gloss — this mirrors the ground truth,
// not the brief's paraphrase (see task-4-report.md reconciliation notes).
// Also inserts an audit row into pain_logs, which has no localRepo
// equivalent (Task-1 table with no Phase-1 analogue) but is what the
// dedicated table exists for.
async function logPain(areaId: string, severity: number, note?: string): Promise<void> {
  const parsedAreaId = z.string().min(1).parse(areaId);
  const parsedSeverity = z.number().parse(severity);
  const parsedNote = note === undefined ? undefined : z.string().parse(note);

  const client = getBrowserClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("logPain: no authenticated user");

  const { error: logError } = await client.from("pain_logs").insert({
    user_id: user.id,
    area_id: parsedAreaId,
    severity: parsedSeverity,
    note: parsedNote ?? null,
  });
  if (logError) throw logError;

  const { data: area, error: readError } = await client
    .from("pain_areas")
    .select("payload")
    .eq("id", parsedAreaId)
    .single();
  if (readError) throw readError;

  const nextPayload =
    parsedNote === undefined
      ? area.payload
      : { ...(area.payload as Record<string, unknown>), label: parsedNote };

  const { error: updateError } = await client
    .from("pain_areas")
    .update({ severity: parsedSeverity, payload: nextPayload })
    .eq("id", parsedAreaId);
  if (updateError) throw updateError;
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

// Mirrors local-repo.ts appendChat: `overlay.chatAppended.push(msg)`. `seq`
// has no equivalent in the append-only localStorage array (it's just
// array order there); computing max(seq)+1 scoped to this user is the
// supabase-side stand-in. Two concurrent appends could compute the same
// next seq before either commits and race — acceptable for this
// single-user app; closing it for real would need a DB sequence or a
// serializable transaction.
async function appendChat(msg: ChatMessage): Promise<void> {
  const parsed = chatMessageSchema.parse(msg);
  const client = getBrowserClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("appendChat: no authenticated user");

  const { data: maxRow, error: maxError } = await client
    .from("chat_messages")
    .select("seq")
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw maxError;
  const nextSeq = (maxRow?.seq ?? -1) + 1;

  const { error } = await client.from("chat_messages").insert({
    id: parsed.id,
    user_id: user.id,
    role: parsed.role,
    body: parsed.text,
    time_label: parsed.time ?? null,
    proposal_refs: parsed.proposalRefs ?? null,
    seq: nextSeq,
    payload: {},
  });
  if (error) throw error;
}

// Mirrors local-repo.ts logRun exactly:
//   overlay.runLogs.push({ ...entry, loggedAt });
//   if (entry.painAreaId && entry.painSeverity !== undefined)
//     overlay.painOverrides[entry.painAreaId] = { severity: entry.painSeverity, note: <existing note, untouched> };
//   if (entry.sessionId) overlay.sessionStatusChanges[entry.sessionId] = "completed";
// Note the asymmetry with logPain: logRun's pain fold only ever overwrites
// severity and explicitly PRESERVES whatever note/label already exists
// (never clears or replaces it) — logPain can replace the note because a
// note is one of its own explicit params.
async function logRun(entry: LogRunEntry): Promise<void> {
  const parsed = logRunEntrySchema.parse(entry);
  const client = getBrowserClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("logRun: no authenticated user");

  const pain =
    parsed.painAreaId !== undefined || parsed.painSeverity !== undefined
      ? { areaId: parsed.painAreaId, severity: parsed.painSeverity }
      : null;

  const { error: insertError } = await client.from("run_logs").insert({
    user_id: user.id,
    session_id: parsed.sessionId ?? null,
    rpe: parsed.rpe,
    pain,
  });
  if (insertError) throw insertError;

  if (parsed.painAreaId && parsed.painSeverity !== undefined) {
    const { error: painError } = await client
      .from("pain_areas")
      .update({ severity: parsed.painSeverity })
      .eq("id", parsed.painAreaId);
    if (painError) throw painError;
  }

  if (parsed.sessionId) {
    await updateSessionStatusByEitherId(client, parsed.sessionId, "completed");
  }
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
