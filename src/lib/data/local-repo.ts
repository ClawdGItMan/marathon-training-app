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
  status: z.enum(["accepted", "modified", "dismissed"]),
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

function resolveSession(session: PlannedSession, overlay: Overlay): PlannedSession {
  let resolved = session;

  // A session can carry several open proposals (v2 seed: the day-scope easy
  // swap and the workout-scope 600s variant both target wed-400s). Apply the
  // first decided accept/modify; "dismissed" never touches the plan, so keep
  // scanning past it.
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

  const statusOverride = overlay.sessionStatusChanges[resolved.id];
  if (statusOverride) {
    resolved = { ...resolved, status: statusOverride };
  }

  return resolved;
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

async function getSession(id: string): Promise<PlannedSession> {
  const overlay = readOverlay();
  const base = seed.week.find((s) => s.id === id) ?? (seed.workoutDetail.id === id ? seed.workoutDetail : undefined);
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
