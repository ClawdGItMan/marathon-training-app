import { z } from "zod";

export const structureSegmentSchema = z.object({
  kind: z.enum(["warmup", "rep", "recovery", "cooldown"]),
  label: z.string(),
  zone: z.string(),
  pace: z.string().optional(),
  duration: z.string(),
  repeat: z.number().optional(),
});
export type StructureSegment = z.infer<typeof structureSegmentSchema>;

export const sessionTypeSchema = z.enum([
  "easy",
  "speed",
  "tempo",
  "long",
  "rest",
  "strength",
  "recovery",
]);
export type SessionType = z.infer<typeof sessionTypeSchema>;

export const sessionSchema: z.ZodType<{
  id: string;
  date: string;
  type: SessionType;
  title: string;
  detail: string;
  distanceMi?: number;
  paceTarget?: string;
  zone?: string;
  status: "planned" | "in-progress" | "completed" | "skipped";
  provenance: "original" | "accepted-proposal" | "modified-proposal";
  structure?: StructureSegment[];
}> = z.object({
  id: z.string(),
  date: z.string(),
  type: sessionTypeSchema,
  title: z.string(),
  detail: z.string(),
  distanceMi: z.number().optional(),
  paceTarget: z.string().optional(),
  zone: z.string().optional(),
  status: z.enum(["planned", "in-progress", "completed", "skipped"]),
  provenance: z.enum(["original", "accepted-proposal", "modified-proposal"]),
  structure: z.array(structureSegmentSchema).optional(),
});
export type PlannedSession = z.infer<typeof sessionSchema>;

export const proposalDriverSchema = z.object({
  label: z.string(),
  value: z.string(),
  deltaPct: z.number().optional(),
  /** Pre-formatted delta string when it isn't a percentage (design: SLEEP "−1:32"). */
  deltaText: z.string().optional(),
  /** Explicit color for deltaText (design: SLEEP delta in #FF9A3D). */
  deltaColor: z.string().optional(),
  tone: z.string().optional(),
});

export const proposalSchema = z.object({
  id: z.string(),
  scope: z.enum(["day", "week", "workout"]),
  targetSessionId: z.string(),
  headline: z.string(),
  subhead: z.string(),
  rationale: z.string(),
  badge: z.enum(["HOLD", "GO", "ADJUST"]),
  before: sessionSchema,
  after: sessionSchema,
  drivers: z.array(proposalDriverSchema),
  status: z.enum(["proposed", "accepted", "modified", "dismissed", "expired"]),
  reviewedAt: z.string(),
  chatHeadline: z.string().optional(),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const sleepSchema = z.object({
  durationMin: z.number(),
  needMin: z.number(),
  /** Sleep-quality efficiency stat (design: Recovery screen "EFFICIENCY 88%"). */
  efficiencyPct: z.number(),
  /** Composite sleep score for the Today ring (design: sleep ring "78%") — distinct from efficiencyPct. */
  sleepScorePct: z.number(),
  deepMin: z.number(),
  remMin: z.number(),
  lightMin: z.number(),
});

export const recoverySchema = z.object({
  date: z.string(),
  recoveryPct: z.number(),
  recoveryDelta: z.number(),
  hrv: z.number(),
  hrvDeltaPct: z.number(),
  rhr: z.number(),
  rhrDelta: z.number(),
  respRate: z.number(),
  sleep: sleepSchema,
  load: z.number(),
  loadLabel: z.string(),
});
export type RecoverySnapshot = z.infer<typeof recoverySchema>;

export const painAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  side: z.string().optional(),
  severity: z.number(),
  label: z.string(),
  trend: z.enum(["improving", "steady", "worsening"]),
  trendDays: z.number(),
});
export type PainArea = z.infer<typeof painAreaSchema>;

export const predictionSchema = z.object({
  distance: z.enum(["5K", "10K", "HALF", "FULL"]),
  timeSec: z.number(),
  paceSecPerMi: z.number(),
  deltaSec: z.number(),
});
export type Prediction = z.infer<typeof predictionSchema>;

export const strengthExerciseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  tag: z.string().optional(),
  cue: z.string(),
  muscles: z.array(z.string()),
});
export type StrengthExercise = z.infer<typeof strengthExerciseSchema>;

export const periodizationWeekSchema = z.object({
  phase: z.enum(["base", "build", "peak", "taper"]),
  mi: z.number(),
});
export type PeriodizationWeek = z.infer<typeof periodizationWeekSchema>;

export const trainingBlockSchema = z.object({
  number: z.number(),
  phase: z.string(),
  week: z.number(),
  totalWeeks: z.number(),
  weekMilesDone: z.number(),
  weekMilesTarget: z.number(),
  longRunLabel: z.string(),
});
export type TrainingBlock = z.infer<typeof trainingBlockSchema>;

export const raceGoalSchema = z.object({
  name: z.string(),
  date: z.string(),
  goalSec: z.number(),
  predictedSec: z.number(),
  daysOut: z.number(),
  streak: z.number(),
});
export type RaceGoal = z.infer<typeof raceGoalSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["coach", "user"]),
  text: z.string(),
  proposalRefs: z.array(z.string()).optional(),
  /** "11:01" style clock label (design #7f "COACH · 11:01"). Coach-role only
   * — "YOU" rows never show a time in the mock. Optional so older/omitted
   * entries just render the bare role label. */
  time: z.string().optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const activitySchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  distanceMi: z.number(),
  timeSec: z.number(),
  paceSecPerMi: z.number(),
  synced: z.boolean(),
});
export type Activity = z.infer<typeof activitySchema>;

export const seedSchema = z.object({
  goal: raceGoalSchema,
  block: trainingBlockSchema,
  recovery: z.array(recoverySchema),
  todaySessionId: z.string(),
  week: z.array(sessionSchema),
  proposals: z.array(proposalSchema),
  pains: z.array(painAreaSchema),
  predictions: z.array(predictionSchema),
  strength: z.object({
    phase: z.string(),
    note: z.string(),
    /** Index into the 5-stage phase tracker (ADAPT/HYPER/MAX/POWER/MAINT), design #7e. */
    phaseIndex: z.number(),
    /** Corner-tick COACH note under the checklist, design #7e. */
    coachNote: z.string(),
    session: z.array(strengthExerciseSchema),
  }),
  workoutDetail: sessionSchema,
  coachThread: z.array(chatMessageSchema),
  mileage12wk: z.array(z.number()),
  fitness90d: z.array(z.number()),
  activities: z.array(activitySchema),
  /** 16-week block chart data (design #7a "16-WEEK BLOCK"), 4 weeks per phase. */
  periodization: z.array(periodizationWeekSchema),
});
export type Seed = z.infer<typeof seedSchema>;
