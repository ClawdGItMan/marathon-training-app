import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whoop/Strava dedupe (Task 11, spec §6 verbatim): a Whoop activity and a
 * Strava activity are the same physical run when sport is run-equivalent
 * AND their start/end windows overlap by >= 0.5 of the SHORTER window.
 * Merge keeps Strava's distance/pace fields (source of truth per spec) and
 * adopts Whoop's strain/HR fields, then deletes the now-redundant
 * Whoop-only row. Called from the Strava import path
 * (src/lib/integrations/strava/sync.ts) right after a Strava activity is
 * upserted — see that module for why dedupe is one-directional (only
 * triggered by a Strava import finding a pre-existing Whoop row, never the
 * reverse).
 */

/**
 * Run-equivalent sport values across both providers, verified against what
 * each sync path actually writes into `activities.sport`:
 *  - Strava `sport_type` (src/lib/integrations/strava/wire.ts,
 *    tests/fixtures/strava/activities.json) — PascalCase.
 *  - Whoop `sport_name` (src/lib/integrations/whoop/sync.ts writes
 *    `w.sport_name` verbatim; tests/fixtures/whoop/workout.json) —
 *    lowercase "running".
 * Deliberately explicit rather than a case-insensitive/fuzzy match: an
 * unrecognized sport value is treated as NOT run-equivalent, never
 * silently merged.
 */
export const RUN_EQUIVALENT_SPORTS: ReadonlySet<string> = new Set([
  "Run",
  "TrailRun",
  "VirtualRun",
  "running",
]);

const DEDUPE_OVERLAP_THRESHOLD = 0.5;

/** Fraction of the SHORTER [aStart,aEnd)/[bStart,bEnd) window the two windows overlap by, in [0,1]. */
export function overlapRatio(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const aLen = aEnd.getTime() - aStart.getTime();
  const bLen = bEnd.getTime() - bStart.getTime();
  const shorter = Math.min(aLen, bLen);
  if (shorter <= 0) return 0;

  const overlapStart = Math.max(aStart.getTime(), bStart.getTime());
  const overlapEnd = Math.min(aEnd.getTime(), bEnd.getTime());
  const overlapMs = Math.max(0, overlapEnd - overlapStart);

  return overlapMs / shorter;
}

const dedupeCandidateRowSchema = z.object({
  id: z.string(),
  sport: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  whoop_id: z.string().nullable(),
  strain: z.number().nullable(),
  avg_hr: z.number().nullable(),
  max_hr: z.number().nullable(),
  hr_zones: z.unknown().nullable(),
});

export type ImportedActivityRow = {
  id: string;
  sport: string;
  started_at: string;
  ended_at: string;
};

/**
 * Looks for a pre-existing Whoop-only row (strava_id null, whoop_id set)
 * belonging to `userId` whose time window overlaps `imported` by >= 0.5 of
 * the shorter window and whose sport is run-equivalent. If found, merges
 * its strain/HR fields into `imported` (in place, by id) and deletes the
 * Whoop-only row. No-ops (no query at all) when `imported`'s own sport
 * isn't run-equivalent — a bike ride never triggers a dedupe lookup.
 */
export async function dedupeWhoop(
  admin: SupabaseClient,
  userId: string,
  imported: ImportedActivityRow
): Promise<void> {
  if (!RUN_EQUIVALENT_SPORTS.has(imported.sport)) return;

  const { data, error } = await admin
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .is("strava_id", null)
    .not("whoop_id", "is", null);
  if (error) throw error;

  const candidates = z
    .array(dedupeCandidateRowSchema)
    .parse(data ?? [])
    .filter((row) => RUN_EQUIVALENT_SPORTS.has(row.sport));

  const importedStart = new Date(imported.started_at);
  const importedEnd = new Date(imported.ended_at);

  let best: z.infer<typeof dedupeCandidateRowSchema> | null = null;
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = overlapRatio(
      importedStart,
      importedEnd,
      new Date(candidate.started_at),
      new Date(candidate.ended_at)
    );
    if (ratio >= DEDUPE_OVERLAP_THRESHOLD && ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  if (!best) return;

  const { error: updateError } = await admin
    .from("activities")
    .update({
      whoop_id: best.whoop_id,
      strain: best.strain,
      avg_hr: best.avg_hr,
      max_hr: best.max_hr,
      hr_zones: best.hr_zones,
    })
    .eq("id", imported.id);
  if (updateError) throw updateError;

  const { error: deleteError } = await admin.from("activities").delete().eq("id", best.id);
  if (deleteError) throw deleteError;
}
