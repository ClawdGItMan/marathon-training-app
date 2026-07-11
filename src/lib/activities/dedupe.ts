import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RUN_EQUIVALENT_SPORTS } from "./sports";

/**
 * Whoop/Strava dedupe (Task 11, spec §6 verbatim; made BIDIRECTIONAL in fix
 * loop 1): a Whoop activity and a Strava activity are the same physical run
 * when sport is run-equivalent AND their start/end windows overlap by
 * >= 0.5 of the SHORTER window. The merge always survives as the STRAVA
 * row — it keeps its strava_id/distance/pace fields (Strava is source of
 * truth per spec) and absorbs the Whoop row's whoop_id/strain/HR fields;
 * the redundant Whoop-only row is deleted.
 *
 * ONE merge implementation (`mergeWhoopIntoStrava`), TWO trigger
 * directions:
 *  - `dedupeWhoop(admin, userId, imported)` — a newly-imported STRAVA
 *    activity looks for a pre-existing Whoop-only row
 *    (src/lib/integrations/strava/sync.ts's importStravaActivity).
 *  - `dedupeStrava(admin, userId, inserted)` — a newly-INSERTED Whoop
 *    workout looks for a pre-existing unmerged Strava row
 *    (src/lib/integrations/whoop/sync.ts's syncWhoop, on inserted rows
 *    only — skipped duplicates never re-trigger it).
 * The reverse trigger closes the webhook-first ordering hole the original
 * one-directional design left open: a Strava webhook import logs its own
 * ok `sync_runs` row, which advances the morning sweep's
 * `lastOkStravaSync` PAST that activity — so the sweep would never
 * re-import it, and the overnight Whoop workout would otherwise duplicate
 * it forever. Deduping at Whoop insertion time makes the heal
 * deterministic and ordering-independent.
 */

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

/**
 * The Whoop-side row shape (the row that gets merged AWAY, contributing
 * whoop_id/strain/HR). Exported so whoop/sync.ts can Zod-parse the rows
 * its insert returns before handing them to `dedupeStrava`.
 */
export const whoopSideRowSchema = z.object({
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
export type WhoopSideRow = z.infer<typeof whoopSideRowSchema>;

/** The Strava-side row shape (the SURVIVING row) as the reverse trigger's candidate query reads it. */
const stravaSideRowSchema = z.object({
  id: z.string(),
  sport: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
});

export type ImportedActivityRow = {
  id: string;
  sport: string;
  started_at: string;
  ended_at: string;
};

type Window = { started_at: string; ended_at: string };

/** Best candidate whose window overlaps `target`'s by >= the merge threshold, or null. */
function pickBestOverlap<T extends Window>(target: Window, candidates: T[]): T | null {
  const targetStart = new Date(target.started_at);
  const targetEnd = new Date(target.ended_at);

  let best: T | null = null;
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = overlapRatio(
      targetStart,
      targetEnd,
      new Date(candidate.started_at),
      new Date(candidate.ended_at)
    );
    if (ratio >= DEDUPE_OVERLAP_THRESHOLD && ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * The single merge implementation both trigger directions funnel into:
 * deletes the redundant Whoop-only row, then stamps its
 * whoop_id/strain/HR fields onto the surviving Strava row.
 *
 * DELETE FIRST, UPDATE SECOND — the order is load-bearing:
 * `activities.whoop_id` is globally UNIQUE (supabase/migrations/
 * 0001_schema.sql), so writing the Whoop row's whoop_id onto the Strava
 * row while the Whoop row still exists would violate the constraint on
 * real Postgres (fix loop 1 caught this; the in-memory test fake doesn't
 * enforce uniqueness, which is why Task 11's original update-then-delete
 * order passed its tests). A crash between the two statements is
 * self-healing: the Whoop row is gone, so the next `syncWhoop` re-inserts
 * that workout (its whoop_id no longer exists) and the reverse trigger
 * merges it again.
 */
async function mergeWhoopIntoStrava(
  admin: SupabaseClient,
  stravaRowId: string,
  whoop: WhoopSideRow
): Promise<void> {
  const { error: deleteError } = await admin.from("activities").delete().eq("id", whoop.id);
  if (deleteError) throw deleteError;

  const { error: updateError } = await admin
    .from("activities")
    .update({
      whoop_id: whoop.whoop_id,
      strain: whoop.strain,
      avg_hr: whoop.avg_hr,
      max_hr: whoop.max_hr,
      hr_zones: whoop.hr_zones,
    })
    .eq("id", stravaRowId);
  if (updateError) throw updateError;
}

/**
 * Forward trigger (Strava import): looks for a pre-existing Whoop-only row
 * (strava_id null, whoop_id set) belonging to `userId` whose time window
 * overlaps `imported` by >= 0.5 of the shorter window and whose sport is
 * run-equivalent. If found, merges it into `imported` via
 * `mergeWhoopIntoStrava`. No-ops (no query at all) when `imported`'s own
 * sport isn't run-equivalent — a bike ride never triggers a dedupe lookup.
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
    .array(whoopSideRowSchema)
    .parse(data ?? [])
    .filter((row) => RUN_EQUIVALENT_SPORTS.has(row.sport));

  const best = pickBestOverlap(imported, candidates);
  if (!best) return;

  await mergeWhoopIntoStrava(admin, imported.id, best);
}

/**
 * Reverse trigger (Whoop insert, fix loop 1): a newly-inserted Whoop
 * workout row looks for a pre-existing UNMERGED Strava row (strava_id set,
 * whoop_id still null — a Strava row that already carries a whoop_id was
 * already merged with its Whoop twin and must not absorb a second one)
 * with the same run-equivalence + overlap rule, and performs the exact
 * same merge: the Strava row survives, `inserted` is deleted. No-ops when
 * `inserted`'s sport isn't run-equivalent (a Whoop strength workout never
 * merges into a Strava run, however tightly the windows overlap).
 */
export async function dedupeStrava(
  admin: SupabaseClient,
  userId: string,
  inserted: WhoopSideRow
): Promise<void> {
  if (!RUN_EQUIVALENT_SPORTS.has(inserted.sport)) return;

  const { data, error } = await admin
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .not("strava_id", "is", null)
    .is("whoop_id", null);
  if (error) throw error;

  const candidates = z
    .array(stravaSideRowSchema)
    .parse(data ?? [])
    .filter((row) => RUN_EQUIVALENT_SPORTS.has(row.sport));

  const best = pickBestOverlap(inserted, candidates);
  if (!best) return;

  await mergeWhoopIntoStrava(admin, best.id, inserted);
}
