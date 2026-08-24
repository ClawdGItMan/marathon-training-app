/**
 * Shared row-shape builders for the eight tables that scripts/generate-supabase-seed.ts
 * (supabase/seed.sql, one-time SQL text) and one or more supabase-js call
 * sites construct from the Phase-1 TypeScript seed object (src/lib/data/seed.ts).
 *
 * Node-side only (no DOM/browser APIs) — deliberately placed outside src/
 * so it can never end up in the Next.js client bundle, even accidentally
 * via a future import from src/lib/data/index.ts or supabase-repo.ts.
 *
 * Each function returns a plain JS object with the exact field values the
 * row should carry (already defaulted where the two original call sites
 * agreed on a default, e.g. `detail ?? null`, `structure ?? []`). Column
 * *order* and wire-format (SQL literal text vs. supabase-js object) stay
 * with each call site — only the data-shape/derivation logic is shared.
 *
 * planned_sessions/proposals/pain_areas/chat_messages have two call sites
 * today: scripts/generate-supabase-seed.ts and
 * tests/parity/reset-supabase-seed.ts (per-test fast reset).
 *
 * goals/blocks/recovery_snapshots/activities were generator-only until now
 * — scripts/lib/demo-reset.ts is their second call site (a supabase-js demo
 * reset), which is exactly the drift condition this file exists to prevent.
 */

import type {
  Activity,
  ChatMessage,
  PainArea,
  PlannedSession,
  Proposal,
  Seed,
} from "../../src/lib/domain/types";

export interface PlannedSessionRow {
  id: string;
  user_id: string;
  date: string;
  title: string;
  type: string;
  detail: string | null;
  structure: PlannedSession["structure"];
  status: string;
  provenance: string;
  payload: {
    distanceMi: PlannedSession["distanceMi"];
    paceTarget: PlannedSession["paceTarget"];
    zone: PlannedSession["zone"];
  };
}

export function toPlannedSessionRow(session: PlannedSession, userId: string): PlannedSessionRow {
  return {
    id: session.id,
    user_id: userId,
    date: session.date,
    title: session.title,
    type: session.type,
    detail: session.detail ?? null,
    structure: session.structure ?? [],
    status: session.status,
    provenance: session.provenance,
    payload: {
      distanceMi: session.distanceMi,
      paceTarget: session.paceTarget,
      zone: session.zone,
    },
  };
}

export interface ProposalRow {
  id: string;
  user_id: string;
  scope: string;
  session_id: string;
  status: string;
  payload: {
    headline: Proposal["headline"];
    subhead: Proposal["subhead"];
    rationale: Proposal["rationale"];
    badge: Proposal["badge"];
    before: Proposal["before"];
    after: Proposal["after"];
    drivers: Proposal["drivers"];
    reviewedAt: Proposal["reviewedAt"];
    chatHeadline: Proposal["chatHeadline"];
  };
}

export function toProposalRow(proposal: Proposal, userId: string): ProposalRow {
  return {
    id: proposal.id,
    user_id: userId,
    scope: proposal.scope,
    session_id: proposal.targetSessionId,
    status: proposal.status,
    payload: {
      headline: proposal.headline,
      subhead: proposal.subhead,
      rationale: proposal.rationale,
      badge: proposal.badge,
      before: proposal.before,
      after: proposal.after,
      drivers: proposal.drivers,
      reviewedAt: proposal.reviewedAt,
      chatHeadline: proposal.chatHeadline,
    },
  };
}

export interface PainAreaRow {
  id: string;
  user_id: string;
  name: string;
  severity: PainArea["severity"];
  trend: string;
  payload: {
    side: PainArea["side"];
    label: PainArea["label"];
    trendDays: PainArea["trendDays"];
  };
}

export function toPainAreaRow(pain: PainArea, userId: string): PainAreaRow {
  return {
    id: pain.id,
    user_id: userId,
    name: pain.name,
    severity: pain.severity,
    trend: pain.trend,
    payload: { side: pain.side, label: pain.label, trendDays: pain.trendDays },
  };
}

export interface ChatMessageRow {
  id: string;
  user_id: string;
  role: string;
  body: string;
  time_label: string | null;
  proposal_refs: ChatMessage["proposalRefs"] | null;
  seq: number;
  payload: Record<string, never>;
}

export function toChatMessageRow(message: ChatMessage, index: number, userId: string): ChatMessageRow {
  return {
    id: message.id,
    user_id: userId,
    role: message.role,
    body: message.text,
    time_label: message.time ?? null,
    proposal_refs: message.proposalRefs ?? null,
    seq: index,
    payload: {},
  };
}

export interface GoalRow {
  id: string;
  user_id: string;
  name: string;
  date: string;
  target_seconds: number;
  payload: {
    predictedSec: Seed["goal"]["predictedSec"];
    daysOut: Seed["goal"]["daysOut"];
    streak: Seed["goal"]["streak"];
  };
}

// predictedSec/daysOut/streak have no dedicated column -> payload (see
// scripts/generate-supabase-seed.ts's "goals" section for the full note).
export function toGoalRow(goal: Seed["goal"], userId: string): GoalRow {
  return {
    id: "goal-1",
    user_id: userId,
    name: goal.name,
    date: goal.date,
    target_seconds: goal.goalSec,
    payload: {
      predictedSec: goal.predictedSec,
      daysOut: goal.daysOut,
      streak: goal.streak,
    },
  };
}

export interface BlockRow {
  id: string;
  user_id: string;
  label: string;
  phase: Seed["block"]["phase"];
  week: number;
  total_weeks: number;
  periodization: Seed["periodization"];
  payload: {
    number: Seed["block"]["number"];
    weekMilesDone: Seed["block"]["weekMilesDone"];
    weekMilesTarget: Seed["block"]["weekMilesTarget"];
  };
}

// number/weekMilesDone/weekMilesTarget have no dedicated column -> payload;
// `label` holds the block's long-run label; `periodization` is the seed's
// top-level 16-week bar-chart array, stored per-block since that's where the
// DDL puts it (see scripts/generate-supabase-seed.ts's "blocks" section).
export function toBlockRow(
  block: Seed["block"],
  periodization: Seed["periodization"],
  userId: string
): BlockRow {
  return {
    id: "block-1",
    user_id: userId,
    label: block.longRunLabel,
    phase: block.phase,
    week: block.week,
    total_weeks: block.totalWeeks,
    periodization,
    payload: {
      number: block.number,
      weekMilesDone: block.weekMilesDone,
      weekMilesTarget: block.weekMilesTarget,
    },
  };
}

export interface RecoverySnapshotRow {
  user_id: string;
  day: string;
  recovery_pct: number;
  hrv_ms: number;
  rhr: number;
  day_strain: number;
  sleep: Seed["recovery"][number]["sleep"] & { respRate: Seed["recovery"][number]["respRate"] };
  source: "whoop";
  payload: {
    recoveryDelta: Seed["recovery"][number]["recoveryDelta"];
    hrvDeltaPct: Seed["recovery"][number]["hrvDeltaPct"];
    rhrDelta: Seed["recovery"][number]["rhrDelta"];
    loadLabel: Seed["recovery"][number]["loadLabel"];
  };
}

// recoveryDelta/hrvDeltaPct/rhrDelta/loadLabel have no dedicated column ->
// payload. respRate has no dedicated column or its own payload slot on this
// table, so it stays folded into the `sleep` jsonb blob rather than dropped
// (see scripts/generate-supabase-seed.ts's "recovery_snapshots" section).
export function toRecoverySnapshotRow(
  snapshot: Seed["recovery"][number],
  userId: string
): RecoverySnapshotRow {
  return {
    user_id: userId,
    day: snapshot.date,
    recovery_pct: snapshot.recoveryPct,
    hrv_ms: snapshot.hrv,
    rhr: snapshot.rhr,
    day_strain: snapshot.load,
    sleep: { ...snapshot.sleep, respRate: snapshot.respRate },
    source: "whoop",
    payload: {
      recoveryDelta: snapshot.recoveryDelta,
      hrvDeltaPct: snapshot.hrvDeltaPct,
      rhrDelta: snapshot.rhrDelta,
      loadLabel: snapshot.loadLabel,
    },
  };
}

export interface ActivityRow {
  user_id: string;
  sport: "run";
  started_at: string;
  ended_at: string;
  distance_m: number;
  moving_sec: Activity["timeSec"];
  avg_pace_sec_per_mi: Activity["paceSecPerMi"];
  payload: {
    id: Activity["id"];
    title: Activity["title"];
    synced: Activity["synced"];
  };
}

// Seed activities predate Strava/Whoop ids; the original string id, title,
// and synced flag have no dedicated column, so they go into payload (see
// scripts/generate-supabase-seed.ts's "activities" section).
export function toActivityRow(activity: Seed["activities"][number], userId: string): ActivityRow {
  const startedAt = `${activity.date}T00:00:00Z`;
  return {
    user_id: userId,
    sport: "run",
    started_at: startedAt,
    ended_at: new Date(Date.parse(startedAt) + activity.timeSec * 1000).toISOString(),
    distance_m: activity.distanceMi * 1609.344,
    moving_sec: activity.timeSec,
    avg_pace_sec_per_mi: activity.paceSecPerMi,
    payload: {
      id: activity.id,
      title: activity.title,
      synced: activity.synced,
    },
  };
}
