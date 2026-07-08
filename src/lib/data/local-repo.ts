import { z } from "zod";
import { seed } from "@/lib/data/seed";
import { chatMessageSchema, sessionSchema } from "@/lib/domain/schemas";
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

const STORAGE_KEY = "marathon.phase1.state";

const proposalDecisionSchema = z.object({
  status: z.enum(["accepted", "modified", "dismissed", "expired"]),
  editedSession: sessionSchema.optional(),
});

const painOverrideSchema = z.object({
  severity: z.number(),
  note: z.string().optional(),
});

const sessionStatusSchema = z.enum(["planned", "in-progress", "completed", "skipped"]);

const runLogSchema = z.object({
  sessionId: z.string().optional(),
  rpe: z.number(),
  painAreaId: z.string().optional(),
  painSeverity: z.number().optional(),
  loggedAt: z.string(),
});

const overlaySchema = z.object({
  proposalDecisions: z.record(z.string(), proposalDecisionSchema).default({}),
  painOverrides: z.record(z.string(), painOverrideSchema).default({}),
  chatAppended: z.array(chatMessageSchema).default([]),
  runLogs: z.array(runLogSchema).default([]),
  sessionStatusChanges: z.record(z.string(), sessionStatusSchema).default({}),
});

type Overlay = z.infer<typeof overlaySchema>;

function emptyOverlay(): Overlay {
  return {
    proposalDecisions: {},
    painOverrides: {},
    chatAppended: [],
    runLogs: [],
    sessionStatusChanges: {},
  };
}

function readOverlay(): Overlay {
  if (typeof window === "undefined") return emptyOverlay();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyOverlay();
    const parsed = overlaySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return emptyOverlay();
    return parsed.data;
  } catch {
    return emptyOverlay();
  }
}

function writeOverlay(overlay: Overlay): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay));
  } catch {
    // ignore write failures (e.g. storage disabled/full) — never throw to UI
  }
}

function withOverlay<T>(mutate: (overlay: Overlay) => T): T {
  const overlay = readOverlay();
  const result = mutate(overlay);
  writeOverlay(overlay);
  return result;
}

/** Merge seed sessions with any decided proposals / status changes / run status. */
function resolveWeekSessions(overlay: Overlay): PlannedSession[] {
  return seed.week.map((session) => resolveSession(session, overlay));
}

/**
 * A session can carry several open proposals (v2 seed: the day-scope easy
 * swap and the workout-scope 600s variant both target wed-400s). Accepting
 * or modifying ANY of them expires the others (see `decideProposal`), so at
 * most one can ever carry status "accepted"/"modified" at a time — no
 * ambiguity, no seed-order dependence. "dismissed" and "expired" both leave
 * the plan untouched; keep scanning past them for the (at most one) decided
 * accept/modify.
 */
function resolveSession(session: PlannedSession, overlay: Overlay): PlannedSession {
  let resolved = session;
  const originalId = session.id;

  for (const proposal of seed.proposals.filter((p) => p.targetSessionId === session.id)) {
    const decision = overlay.proposalDecisions[proposal.id];
    if (!decision) continue;
    if (decision.status === "accepted") {
      resolved = { ...proposal.after, provenance: "accepted-proposal" };
      break;
    }
    if (decision.status === "modified" && decision.editedSession) {
      resolved = { ...decision.editedSession, provenance: "modified-proposal" };
      break;
    }
  }

  // An accepted/modified proposal can change the session's id (e.g.
  // proposal-2: sun-long → sat-long-moved). Status overrides may have been
  // written keyed to either the pre- or post-proposal id, so check both.
  const statusOverride =
    overlay.sessionStatusChanges[resolved.id] ?? overlay.sessionStatusChanges[originalId];
  if (statusOverride) {
    resolved = { ...resolved, status: statusOverride };
  }

  return resolved;
}

/**
 * Finds the seed session id whose decided proposal resolves to `resultingId`
 * (the id an accept/modify produced, e.g. "sat-long-moved"). Lets
 * `getSession` be called with either the pre-proposal or post-proposal id and
 * resolve to the same session (F3: moved-session id resolution).
 */
function findSeedIdForResultingId(resultingId: string, overlay: Overlay): string | undefined {
  for (const proposal of seed.proposals) {
    const decision = overlay.proposalDecisions[proposal.id];
    if (!decision) continue;
    const producedId =
      decision.status === "accepted"
        ? proposal.after.id
        : decision.status === "modified"
          ? decision.editedSession?.id
          : undefined;
    if (producedId === resultingId) return proposal.targetSessionId;
  }
  return undefined;
}

function resolvePains(overlay: Overlay): PainArea[] {
  return seed.pains.map((area) => {
    const override = overlay.painOverrides[area.id];
    if (!override) return area;
    return {
      ...area,
      severity: override.severity,
      label: override.note ?? area.label,
    };
  });
}

function resolveOpenProposals(overlay: Overlay): Proposal[] {
  return seed.proposals.filter((p) => {
    const decision = overlay.proposalDecisions[p.id];
    if (decision) return false;
    return p.status === "proposed";
  });
}

function resolveCoachThread(overlay: Overlay): ChatMessage[] {
  return [...seed.coachThread, ...overlay.chatAppended];
}

async function getGoal(): Promise<RaceGoal> {
  return seed.goal;
}

async function getBlock(): Promise<TrainingBlock> {
  return seed.block;
}

async function getLatestRecovery(): Promise<RecoverySnapshot> {
  const latest = seed.recovery.at(-1);
  if (!latest) throw new Error("No recovery data available");
  return latest;
}

async function getRecovery7d(): Promise<RecoverySnapshot[]> {
  return seed.recovery.slice(-7);
}

async function getWeekSessions(): Promise<PlannedSession[]> {
  const overlay = readOverlay();
  return resolveWeekSessions(overlay);
}

function findSeedSession(id: string): PlannedSession | undefined {
  return seed.week.find((s) => s.id === id) ?? (seed.workoutDetail.id === id ? seed.workoutDetail : undefined);
}

async function getSession(id: string): Promise<PlannedSession> {
  const overlay = readOverlay();
  // id may be a seed id directly, or the id an accepted/modified proposal
  // produced (e.g. "sat-long-moved") — resolve to the underlying seed id
  // either way so both the old and new id land on the same session.
  const seedId = findSeedSession(id) ? id : (findSeedIdForResultingId(id, overlay) ?? id);
  const base = findSeedSession(seedId);
  if (!base) throw new Error(`Unknown session: ${id}`);
  return resolveSession(base, overlay);
}

async function startSession(id: string): Promise<void> {
  withOverlay((overlay) => {
    overlay.sessionStatusChanges[id] = "in-progress";
  });
}

async function getOpenProposals(): Promise<Proposal[]> {
  const overlay = readOverlay();
  return resolveOpenProposals(overlay);
}

async function decideProposal(
  id: string,
  decision: ProposalDecision,
  edited?: PlannedSession
): Promise<void> {
  const proposal = seed.proposals.find((p) => p.id === id);
  if (!proposal) throw new Error(`Unknown proposal: ${id}`);

  withOverlay((overlay) => {
    overlay.proposalDecisions[id] = {
      status: decision,
      editedSession: decision === "modified" ? edited : undefined,
    };

    // Accept/modify resolves what "the plan for this session" is — any other
    // still-open proposal targeting the same session no longer describes a
    // change against current reality, so it expires. Nothing is auto-applied
    // by this: expiring a suggestion applies no plan change, it just retires
    // a stale offer (F1). Dismiss never cascades — a dismissed decision (or
    // any other already-decided one) is left exactly as it is.
    if (decision === "accepted" || decision === "modified") {
      for (const other of seed.proposals) {
        if (other.id === proposal.id) continue;
        if (other.targetSessionId !== proposal.targetSessionId) continue;
        if (other.status !== "proposed") continue;
        if (overlay.proposalDecisions[other.id]) continue; // already decided — leave as-is
        overlay.proposalDecisions[other.id] = { status: "expired" };
      }
    }
  });
}

async function getPains(): Promise<PainArea[]> {
  const overlay = readOverlay();
  return resolvePains(overlay);
}

async function logPain(areaId: string, severity: number, note?: string): Promise<void> {
  withOverlay((overlay) => {
    overlay.painOverrides[areaId] = { severity, note };
  });
}

async function getPredictions(): Promise<Prediction[]> {
  return seed.predictions;
}

async function getStrengthSession(): Promise<StrengthSession> {
  return seed.strength;
}

async function getCoachThread(): Promise<ChatMessage[]> {
  const overlay = readOverlay();
  return resolveCoachThread(overlay);
}

async function appendChat(msg: ChatMessage): Promise<void> {
  withOverlay((overlay) => {
    overlay.chatAppended.push(msg);
  });
}

async function logRun(entry: LogRunEntry): Promise<void> {
  withOverlay((overlay) => {
    overlay.runLogs.push({ ...entry, loggedAt: new Date().toISOString() });
    if (entry.painAreaId && entry.painSeverity !== undefined) {
      overlay.painOverrides[entry.painAreaId] = {
        severity: entry.painSeverity,
        note: overlay.painOverrides[entry.painAreaId]?.note,
      };
    }
    if (entry.sessionId) {
      overlay.sessionStatusChanges[entry.sessionId] = "completed";
    }
  });
}

export const localRepo: Repo = {
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
