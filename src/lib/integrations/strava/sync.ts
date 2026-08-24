import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { dedupeWhoop } from "@/lib/activities/dedupe";
import { matchSession } from "@/lib/activities/matching";
import { RUN_EQUIVALENT_SPORTS } from "@/lib/activities/sports";
import { rowToSession } from "@/lib/data/row-mappers";
import { loadTokens } from "@/lib/integrations/oauth";
import { localDayOf } from "@/lib/sync/timezone";
import { errorMessage } from "@/lib/util/error-message";
import { listActivities, type StravaAuthContext } from "./client";
import type { StravaActivity } from "./wire";

/**
 * Strava import orchestrator (Task 11): `importStravaActivity` is the
 * single idempotent entry point both the webhook route (one activity per
 * event) and `syncStrava`'s catch-up sweep (many activities per run) call —
 * upsert on `strava_id` -> dedupe against any pre-existing Whoop row for the
 * same physical run -> session matching (runs only) -> `sync_runs`
 * bookkeeping is left to the CALLER (webhook route logs one row per event;
 * `syncStrava` logs one row for the whole sweep, mirroring whoop/sync.ts's
 * `syncWhoop` exactly — see `finish` below).
 *
 * WRITE SHAPE IS THE READ CONTRACT (Task 8's hard-won lesson, carried
 * forward): the row upserted here must parse through row-mappers.ts's
 * `rowToActivity` — pinned by a round-trip test in
 * tests/unit/strava-webhook.test.ts, mirroring whoop-sync.test.ts's
 * precedent.
 *
 * Dedupe is BIDIRECTIONAL as of fix loop 1: this import path triggers the
 * forward direction (`dedupeWhoop`: a new Strava row absorbs a
 * pre-existing Whoop-only row), and whoop/sync.ts's `syncWhoop` triggers
 * the reverse (`dedupeStrava`: a newly-inserted Whoop workout merges into
 * a pre-existing Strava row) — same merge implementation, same provenance
 * (the Strava row always survives). See dedupe.ts's module comment for why
 * the reverse trigger is necessary (the webhook-first ordering hole).
 */

export type SyncResult = { ok: boolean; items: number; detail?: string };

const METERS_PER_MILE = 1609.344;
const DEFAULT_HOME_TIMEZONE = "America/New_York";

const upsertedActivityRowSchema = z.object({
  id: z.string(),
  sport: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
});

/**
 * Upserts one Strava activity into `activities` (idempotent on
 * `strava_id`), runs Whoop dedupe, then — for run-equivalent sports ONLY —
 * session matching: a match sets the planned session `completed` and
 * stamps `activities.matched_session_id`. Never writes `sync_runs`;
 * callers own that (see module doc comment).
 */
export async function importStravaActivity(
  admin: SupabaseClient,
  userId: string,
  activity: StravaActivity
): Promise<{ activityId: string; matchedSessionId?: string }> {
  const distanceMi = activity.distance / METERS_PER_MILE;
  const startedAt = new Date(activity.start_date);
  const endedAt = new Date(startedAt.getTime() + activity.elapsed_time * 1000);

  const row = {
    user_id: userId,
    strava_id: activity.id,
    sport: activity.sport_type,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    distance_m: activity.distance,
    moving_sec: activity.moving_time,
    avg_pace_sec_per_mi: distanceMi > 0 ? activity.moving_time / distanceMi : null,
    avg_hr: activity.average_heartrate != null ? Math.round(activity.average_heartrate) : null,
    max_hr: activity.max_heartrate != null ? Math.round(activity.max_heartrate) : null,
    payload: { title: activity.name },
  };

  const { data, error } = await admin.from("activities").upsert(row, { onConflict: "strava_id" }).select().single();
  if (error) throw error;
  const upserted = upsertedActivityRowSchema.parse(data);

  await dedupeWhoop(admin, userId, upserted);

  // Fix loop 1 (Fix 2): spec §6 scopes session matching to imported RUNS
  // ("an imported run matches a planned session if..."). A non-run activity
  // (Ride, Swim, ...) is stored for the record but must never complete a
  // planned run session, however close its distance lands to one.
  if (!RUN_EQUIVALENT_SPORTS.has(activity.sport_type)) {
    return { activityId: upserted.id };
  }

  const tz = await loadHomeTimezone(admin, userId);
  const localDay = localDayOf(startedAt, tz);

  const { data: sessionRows, error: sessionsError } = await admin
    .from("planned_sessions")
    .select("*")
    .eq("user_id", userId);
  if (sessionsError) throw sessionsError;
  const sessions = (sessionRows ?? []).map(rowToSession);

  const matched = matchSession({ localDay, distanceMi }, sessions);
  if (!matched) {
    return { activityId: upserted.id };
  }

  const { error: statusError } = await admin
    .from("planned_sessions")
    .update({ status: "completed" })
    .eq("user_id", userId)
    .eq("id", matched.id);
  if (statusError) throw statusError;

  const { error: matchError } = await admin
    .from("activities")
    .update({ matched_session_id: matched.id })
    .eq("id", upserted.id);
  if (matchError) throw matchError;

  return { activityId: upserted.id, matchedSessionId: matched.id };
}

const lastSyncRowSchema = z.object({ ran_at: z.string() });

/** Latest successful (`ok=true`) `strava` sync_runs row's `ran_at` for `userId`, or `undefined` if never synced. */
async function lastOkStravaSync(admin: SupabaseClient, userId: string): Promise<Date | undefined> {
  const { data, error } = await admin
    .from("sync_runs")
    .select("ran_at")
    .eq("user_id", userId)
    .eq("source", "strava")
    .eq("ok", true)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return new Date(lastSyncRowSchema.parse(data).ran_at);
}

/**
 * Catch-up sweep (Task 11, cron): pulls every Strava activity since the
 * last successful sync (or all-time on a first-ever sync) and imports each
 * — idempotent, so re-running after a partial failure is safe. Mirrors
 * `syncWhoop`'s try/catch-into-`sync_runs` shape exactly.
 */
export async function syncStrava(
  admin: SupabaseClient,
  userId: string,
  opts: { after?: Date } = {}
): Promise<SyncResult> {
  try {
    const tokens = await loadTokens(userId, "strava");
    if (!tokens) {
      return finish(admin, userId, { ok: false, items: 0, detail: "Strava is not connected for this user." });
    }

    const ctx: StravaAuthContext = {
      userId,
      tokens: { access: tokens.access, refresh: tokens.refresh },
      athleteRef: tokens.athleteRef ?? null,
    };

    const after = opts.after ?? (await lastOkStravaSync(admin, userId));
    const activities = await listActivities(ctx, { after });

    // Sequential, not Promise.all: mirrors syncWhoop's rationale exactly —
    // fetchWithAutoRefresh mutates ctx.tokens in place on a 401-triggered
    // refresh, and concurrent calls could race to refresh with the same
    // single-use refresh token.
    for (const activity of activities) {
      await importStravaActivity(admin, userId, activity);
    }

    // M1: `await` is load-bearing — without it a rejected finish (the
    // sync_runs bookkeeping insert failing) escapes this try and the caller
    // gets a throw instead of the documented never-throws SyncResult.
    return await finish(admin, userId, { ok: true, items: activities.length });
  } catch (err) {
    const result = { ok: false, items: 0, detail: errorMessage(err) };
    try {
      return await finish(admin, userId, result);
    } catch {
      // Even the failure bookkeeping failed — still honor the contract.
      return result;
    }
  }
}

async function loadHomeTimezone(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin.from("profiles").select("home_timezone").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data as { home_timezone?: string } | null)?.home_timezone ?? DEFAULT_HOME_TIMEZONE;
}

/** Writes a sync_runs row unconditionally (success or failure) and returns `result` unchanged. */
async function finish(admin: SupabaseClient, userId: string, result: SyncResult): Promise<SyncResult> {
  const { error } = await admin.from("sync_runs").insert({
    user_id: userId,
    source: "strava",
    ok: result.ok,
    items: result.items,
    detail: result.detail ?? null,
  });
  if (error) throw error;
  return result;
}
