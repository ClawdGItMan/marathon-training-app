import { z } from "zod";

/**
 * Whoop API v2 wire schemas for the recovery/sleep/cycle/workout collection
 * endpoints (Task 8) — Zod-parsed at the external-API boundary per
 * p2-globals.md. Shapes verified against https://developer.whoop.com/api/
 * (collection endpoint reference), .../docs/developing/pagination/, and
 * .../docs/developing/user-data/recovery/ at implementation time — the
 * task-8-brief.md prose is the contract to fill, not to trust blindly.
 *
 * Confirmed facts baked into these schemas:
 *  - `score` is present ONLY when `score_state === "SCORED"`;
 *    PENDING_SCORE/UNSCORABLE records omit the field entirely (not null) —
 *    hence `.optional()` rather than `.nullable()`.
 *  - Duration fields ending in `_milli` are already expressed in
 *    milliseconds (same convention as v1's `hrv_rmssd_milli`), so mapping
 *    them to our stored seconds/ms units is a straight divide-by-1000, not
 *    a unit-scale conversion.
 *  - Pagination envelope: `{records: [...], next_token}`. `next_token` is
 *    empty/absent once all pages are consumed; the *request* query param
 *    for the next page is `nextToken` (camelCase) — distinct from the
 *    response field's snake_case `next_token`.
 *  - `sleep_efficiency_percentage` and `sleep_performance_percentage` are
 *    two DISTINCT WHOOP metrics (time-asleep ratio vs. the "Sleep Score"
 *    shown in the app) — mapped below to `efficiencyPct` / `sleepScorePct`
 *    respectively, preserving the hard-won Phase-1 invariant that these
 *    never collapse into one value.
 *
 * Only fields this task actually consumes are modeled; unknown fields on
 * the real payload are ignored by Zod's default (non-strict) object
 * parsing rather than rejected, so additive API changes don't break sync.
 */

const scoreStateSchema = z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]);

function collectionSchema<Rec extends z.ZodTypeAny>(record: Rec) {
  return z.object({
    records: z.array(record),
    next_token: z.string().nullable().optional(),
  });
}

// ---- recovery (GET /recovery) ------------------------------------------------

const whoopRecoveryScoreSchema = z.object({
  recovery_score: z.number(),
  resting_heart_rate: z.number(),
  hrv_rmssd_milli: z.number(),
});

export const whoopRecoveryRecordSchema = z.object({
  cycle_id: z.number(),
  sleep_id: z.string(),
  score_state: scoreStateSchema,
  score: whoopRecoveryScoreSchema.optional(),
});
export type WhoopRecoveryRecord = z.infer<typeof whoopRecoveryRecordSchema>;
export const whoopRecoveryCollectionSchema = collectionSchema(whoopRecoveryRecordSchema);

// ---- sleep (GET /activity/sleep) ---------------------------------------------

const whoopSleepStageSummarySchema = z.object({
  total_light_sleep_time_milli: z.number(),
  total_slow_wave_sleep_time_milli: z.number(),
  total_rem_sleep_time_milli: z.number(),
});

const whoopSleepScoreSchema = z.object({
  stage_summary: whoopSleepStageSummarySchema,
  sleep_performance_percentage: z.number(),
  sleep_efficiency_percentage: z.number(),
});

export const whoopSleepRecordSchema = z.object({
  id: z.string(),
  cycle_id: z.number(),
  score_state: scoreStateSchema,
  score: whoopSleepScoreSchema.optional(),
});
export type WhoopSleepRecord = z.infer<typeof whoopSleepRecordSchema>;
export const whoopSleepCollectionSchema = collectionSchema(whoopSleepRecordSchema);

// ---- cycle (GET /cycle) --------------------------------------------------------

const whoopCycleScoreSchema = z.object({
  strain: z.number(),
});

export const whoopCycleRecordSchema = z.object({
  id: z.number(),
  // Whoop's own docs example: `end` is nullable — an in-progress ("current")
  // cycle has no end yet. Day attribution (this task) requires a concrete
  // end, so sync.ts skips recoveries whose cycle hasn't ended.
  end: z.string().nullable(),
  score_state: scoreStateSchema,
  score: whoopCycleScoreSchema.optional(),
});
export type WhoopCycleRecord = z.infer<typeof whoopCycleRecordSchema>;
export const whoopCycleCollectionSchema = collectionSchema(whoopCycleRecordSchema);

// ---- workout (GET /activity/workout) -------------------------------------------

const whoopWorkoutZoneDurationsSchema = z.object({
  zone_zero_milli: z.number(),
  zone_one_milli: z.number(),
  zone_two_milli: z.number(),
  zone_three_milli: z.number(),
  zone_four_milli: z.number(),
  zone_five_milli: z.number(),
});

const whoopWorkoutScoreSchema = z.object({
  strain: z.number(),
  average_heart_rate: z.number(),
  max_heart_rate: z.number(),
  zone_durations: whoopWorkoutZoneDurationsSchema.optional(),
});

export const whoopWorkoutRecordSchema = z.object({
  id: z.string(),
  start: z.string(),
  end: z.string(),
  sport_name: z.string(),
  score_state: scoreStateSchema,
  score: whoopWorkoutScoreSchema.optional(),
});
export type WhoopWorkoutRecord = z.infer<typeof whoopWorkoutRecordSchema>;
export const whoopWorkoutCollectionSchema = collectionSchema(whoopWorkoutRecordSchema);
