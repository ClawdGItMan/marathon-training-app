import { z } from "zod";
import {
  activitySchema,
  chatMessageSchema,
  painAreaSchema,
  proposalDriverSchema,
  proposalSchema,
  raceGoalSchema,
  recoverySchema,
  sessionSchema,
  sessionTypeSchema,
  structureSegmentSchema,
  trainingBlockSchema,
} from "@/lib/domain/schemas";
import type {
  Activity,
  ChatMessage,
  PainArea,
  PlannedSession,
  Proposal,
  RaceGoal,
  RecoverySnapshot,
  TrainingBlock,
} from "@/lib/domain/types";

/**
 * Row <-> domain mappers for supabaseRepo. Each `rowToX(row: unknown): X` is
 * a two-step Zod parse: first the DB row's own wire shape (snake_case
 * columns + typed payload jsonb), then the domain schema from
 * src/lib/domain/schemas.ts — so a malformed row fails loudly at the
 * boundary rather than propagating bad data into the UI.
 */

// ---- goals ------------------------------------------------------------------
// predictedSec/daysOut/streak live in `payload` (migration 0002).

const goalRowSchema = z.object({
  name: z.string(),
  date: z.string(),
  target_seconds: z.number(),
  payload: z.object({
    predictedSec: z.number(),
    daysOut: z.number(),
    streak: z.number(),
  }),
});

export function rowToGoal(row: unknown): RaceGoal {
  const r = goalRowSchema.parse(row);
  return raceGoalSchema.parse({
    name: r.name,
    date: r.date,
    goalSec: r.target_seconds,
    predictedSec: r.payload.predictedSec,
    daysOut: r.payload.daysOut,
    streak: r.payload.streak,
  });
}

// ---- blocks -------------------------------------------------------------
// number/weekMilesDone/weekMilesTarget live in `payload` (migration 0002).
// `periodization` (16-week bar chart) is not part of the TrainingBlock
// domain type — it has no Repo getter yet, so it is not read here.

const blockRowSchema = z.object({
  label: z.string(),
  phase: z.string(),
  week: z.number(),
  total_weeks: z.number(),
  payload: z.object({
    number: z.number(),
    weekMilesDone: z.number(),
    weekMilesTarget: z.number(),
  }),
});

export function rowToBlock(row: unknown): TrainingBlock {
  const r = blockRowSchema.parse(row);
  return trainingBlockSchema.parse({
    number: r.payload.number,
    phase: r.phase,
    week: r.week,
    totalWeeks: r.total_weeks,
    weekMilesDone: r.payload.weekMilesDone,
    weekMilesTarget: r.payload.weekMilesTarget,
    longRunLabel: r.label,
  });
}

// ---- recovery_snapshots -----------------------------------------------------
// recoveryDelta/hrvDeltaPct/rhrDelta/loadLabel live in `payload` (migration
// 0002). respRate has no dedicated column or payload slot on this table, so
// it stays folded into the `sleep` jsonb blob (see generate-supabase-seed.ts).

const recoverySleepRowSchema = z.object({
  durationMin: z.number(),
  needMin: z.number(),
  efficiencyPct: z.number(),
  sleepScorePct: z.number(),
  deepMin: z.number(),
  remMin: z.number(),
  lightMin: z.number(),
  respRate: z.number(),
});

const recoveryRowSchema = z.object({
  day: z.string(),
  recovery_pct: z.number(),
  hrv_ms: z.number(),
  rhr: z.number(),
  day_strain: z.number(),
  sleep: recoverySleepRowSchema,
  payload: z.object({
    recoveryDelta: z.number(),
    hrvDeltaPct: z.number(),
    rhrDelta: z.number(),
    loadLabel: z.string(),
  }),
});

export function rowToRecovery(row: unknown): RecoverySnapshot {
  const r = recoveryRowSchema.parse(row);
  return recoverySchema.parse({
    date: r.day,
    recoveryPct: r.recovery_pct,
    recoveryDelta: r.payload.recoveryDelta,
    hrv: r.hrv_ms,
    hrvDeltaPct: r.payload.hrvDeltaPct,
    rhr: r.rhr,
    rhrDelta: r.payload.rhrDelta,
    respRate: r.sleep.respRate,
    sleep: {
      durationMin: r.sleep.durationMin,
      needMin: r.sleep.needMin,
      efficiencyPct: r.sleep.efficiencyPct,
      sleepScorePct: r.sleep.sleepScorePct,
      deepMin: r.sleep.deepMin,
      remMin: r.sleep.remMin,
      lightMin: r.sleep.lightMin,
    },
    load: r.day_strain,
    loadLabel: r.payload.loadLabel,
  });
}

// ---- planned_sessions -----------------------------------------------------
// distanceMi/paceTarget/zone live in `payload`. `payload.movedFromId` is the
// dual-id link a moved session (e.g. proposal-2's sun-long -> sat-long-moved)
// will carry once Task 4 implements decideProposal — no seeded row has it
// yet, so supabaseRepo.getSession's fallback lookup is read-shape-only until
// then.

const plannedSessionRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  type: sessionTypeSchema,
  detail: z.string().nullable(),
  structure: z.array(structureSegmentSchema).default([]),
  status: z.enum(["planned", "in-progress", "completed", "skipped"]),
  provenance: z.enum(["original", "accepted-proposal", "modified-proposal"]),
  payload: z
    .object({
      distanceMi: z.number().optional(),
      paceTarget: z.string().optional(),
      zone: z.string().optional(),
      movedFromId: z.string().optional(),
    })
    .default({}),
});

export function rowToSession(row: unknown): PlannedSession {
  const r = plannedSessionRowSchema.parse(row);
  return sessionSchema.parse({
    id: r.id,
    date: r.date,
    type: r.type,
    title: r.title,
    detail: r.detail ?? "",
    distanceMi: r.payload.distanceMi,
    paceTarget: r.payload.paceTarget,
    zone: r.payload.zone,
    status: r.status,
    provenance: r.provenance,
    structure: r.structure.length > 0 ? r.structure : undefined,
  });
}

// ---- proposals --------------------------------------------------------------
// Everything but id/scope/session_id/status lives in payload verbatim,
// including the full before/after session objects — this is what preserves
// the moved-session dual-id and the per-screen copy fields untouched.

const proposalPayloadRowSchema = z.object({
  headline: z.string(),
  subhead: z.string(),
  rationale: z.string(),
  badge: z.enum(["HOLD", "GO", "ADJUST"]),
  before: sessionSchema,
  after: sessionSchema,
  drivers: z.array(proposalDriverSchema),
  reviewedAt: z.string(),
  chatHeadline: z.string().optional(),
});

const proposalRowSchema = z.object({
  id: z.string(),
  scope: z.enum(["day", "week", "workout"]),
  session_id: z.string(),
  status: z.enum(["proposed", "accepted", "modified", "dismissed", "expired"]),
  payload: proposalPayloadRowSchema,
});

export function rowToProposal(row: unknown): Proposal {
  const r = proposalRowSchema.parse(row);
  return proposalSchema.parse({
    id: r.id,
    scope: r.scope,
    targetSessionId: r.session_id,
    headline: r.payload.headline,
    subhead: r.payload.subhead,
    rationale: r.payload.rationale,
    badge: r.payload.badge,
    before: r.payload.before,
    after: r.payload.after,
    drivers: r.payload.drivers,
    status: r.status,
    reviewedAt: r.payload.reviewedAt,
    chatHeadline: r.payload.chatHeadline,
  });
}

// ---- pain_areas ---------------------------------------------------------

const painAreaRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  severity: z.number(),
  trend: z.enum(["improving", "steady", "worsening"]),
  payload: z.object({
    side: z.string().optional(),
    label: z.string(),
    trendDays: z.number(),
  }),
});

export function rowToPainArea(row: unknown): PainArea {
  const r = painAreaRowSchema.parse(row);
  return painAreaSchema.parse({
    id: r.id,
    name: r.name,
    side: r.payload.side,
    severity: r.severity,
    label: r.payload.label,
    trend: r.trend,
    trendDays: r.payload.trendDays,
  });
}

// ---- activities -----------------------------------------------------------
// Written by src/lib/integrations/strava/sync.ts's importStravaActivity
// (Task 11) and src/lib/integrations/whoop/sync.ts's syncWhoop (Task 8) —
// this mapper is exercised by both writers' round-trip guard tests. The
// domain `Activity` type has no dedicated table columns for `title`/`synced`
// (see supabase/migrations/0001_schema.sql — `activities` has no `title`
// column at all), so `title` is folded into `payload.title` (falls back to
// "Run" for a Whoop-only row, which never sets it) and `synced` is always
// `true` — every row in this table came from a real Strava/Whoop import.
// `date` is the row's `started_at` UTC calendar day (NOT a home-timezone
// local day): this field isn't rendered anywhere today
// (ImportedRunSection.tsx only reads title/distanceMi/timeSec/paceSecPerMi),
// so a full tz-aware lookup here is unwarranted complexity — revisit if a
// future screen needs a tz-correct display date.

const METERS_PER_MILE = 1609.344;

const activityRowSchema = z.object({
  id: z.string(),
  started_at: z.string(),
  distance_m: z.number().nullable(),
  moving_sec: z.number().nullable(),
  avg_pace_sec_per_mi: z.number().nullable(),
  payload: z.object({ title: z.string().optional() }).default({}),
});

export function rowToActivity(row: unknown): Activity {
  const r = activityRowSchema.parse(row);
  return activitySchema.parse({
    id: r.id,
    date: r.started_at.slice(0, 10),
    title: r.payload.title ?? "Run",
    distanceMi: (r.distance_m ?? 0) / METERS_PER_MILE,
    timeSec: r.moving_sec ?? 0,
    paceSecPerMi: r.avg_pace_sec_per_mi ?? 0,
    synced: true,
  });
}

// ---- chat_messages -----------------------------------------------------

const chatMessageRowSchema = z.object({
  id: z.string(),
  role: z.enum(["coach", "user"]),
  body: z.string(),
  time_label: z.string().nullable(),
  proposal_refs: z.array(z.string()).nullable(),
});

export function rowToChatMessage(row: unknown): ChatMessage {
  const r = chatMessageRowSchema.parse(row);
  return chatMessageSchema.parse({
    id: r.id,
    role: r.role,
    text: r.body,
    proposalRefs: r.proposal_refs ?? undefined,
    time: r.time_label ?? undefined,
  });
}
