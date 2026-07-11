import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { dedupeWhoop } from "@/lib/activities/dedupe";
import { matchSession } from "@/lib/activities/matching";
import { rowToSession } from "@/lib/data/row-mappers";
import { loadTokens } from "@/lib/integrations/oauth";
import { localDayOf } from "@/lib/sync/timezone";
import { listActivities, type StravaAuthContext } from "./client";
import type { StravaActivity } from "./wire";

/**
 * Strava import orchestrator (Task 11): `importStravaActivity` is the
 * single idempotent entry point both the webhook route (one activity per
 * event) and `syncStrava`'s catch-up sweep (many activities per run) call —
 * upsert on `strava_id` -> dedupe against any pre-existing Whoop row for the
 * same physical run -> session matching -> `sync_runs` bookkeeping is left
 * to the CALLER (webhook route logs one row per event; `syncStrava` logs
 * one row for the whole sweep, mirroring whoop/sync.ts's `syncWhoop`
 * exactly — see `finish` below).
 *
 * WRITE SHAPE IS THE READ CONTRACT (Task 8's hard-won lesson, carried
 * forward): the row upserted here must parse through row-mappers.ts's
 * `rowToActivity` — pinned by a round-trip test in
 * tests/unit/strava-webhook.test.ts, mirroring whoop-sync.test.ts's
 * precedent.
 *
 * Dedupe is ONE-DIRECTIONAL by construction: only a Strava import ever
 * calls `dedupeWhoop` (looking for a pre-existing Whoop-only row to merge
 * into). Task 8's `syncWhoop` never calls it (that file is out of this
 * task's scope, and Task 8 predates Task 11 — see its own comment: "Strava/
 * Whoop cross-source dedupe is Task 11"). Known consequence, not fixed
 * here: if a Strava webhook imports a run BEFORE the next Whoop sync
 * writes the matching workout, that later Whoop sync inserts its own
 * unmerged row (whoop_id set, strava_id null) that nothing ever revisits —
 * dedupe only fires at Strava-import time. In practice the morning cron
 * runs `syncWhoop` before `syncStrava` (see cron/morning/route.ts), so the
 * common catch-up-sweep path merges correctly; only a Strava-webhook-before-
 * next-Whoop-sync ordering can leave a stray duplicate. Flagged for a
 * future task, not silently ignored.
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
 * `strava_id`), runs Whoop dedupe, then session matching — a match sets the
 * planned session `completed` and stamps `activities.matched_session_id`.
 * Never writes `sync_runs`; callers own that (see module doc comment).
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

    return finish(admin, userId, { ok: true, items: activities.length });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return finish(admin, userId, { ok: false, items: 0, detail });
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
