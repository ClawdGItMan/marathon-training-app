import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTokens } from "@/lib/integrations/oauth";
import { localDayOf } from "@/lib/sync/timezone";
import {
  fetchWhoopCycles,
  fetchWhoopRecoveries,
  fetchWhoopSleeps,
  fetchWhoopWorkouts,
  type WhoopAuthContext,
} from "./client";

/**
 * Whoop sync orchestrator (Task 8): pulls recovery/sleep/cycle/workout data
 * and upserts it into `recovery_snapshots` / `activities`, writing a
 * `sync_runs` row either way. Takes the admin `SupabaseClient` as a
 * parameter (does not call `getAdminClient()` itself) specifically so it's
 * testable with a stubbed client per task-8-brief.md.
 */

export type SyncResult = { ok: boolean; items: number; detail?: string };

const DEFAULT_HOME_TIMEZONE = "America/New_York";

export async function syncWhoop(
  admin: SupabaseClient,
  userId: string,
  opts: { since?: Date } = {}
): Promise<SyncResult> {
  try {
    const tokens = await loadTokens(userId, "whoop");
    if (!tokens) {
      return finish(admin, userId, { ok: false, items: 0, detail: "Whoop is not connected for this user." });
    }

    const ctx: WhoopAuthContext = { userId, tokens: { access: tokens.access, refresh: tokens.refresh } };
    const tz = await loadHomeTimezone(admin, userId);

    // Sequential, not Promise.all: whoopFetch mutates ctx.tokens in place on
    // a 401-triggered refresh, and Whoop rotates the refresh token on every
    // use. Concurrent calls could each observe a 401 and race to refresh
    // with the same (single-use) refresh token, and the loser would fail.
    // Sequential calls guarantee at most one refresh per sync run.
    const recoveries = await fetchWhoopRecoveries(ctx, opts.since);
    const sleeps = await fetchWhoopSleeps(ctx, opts.since);
    const cycles = await fetchWhoopCycles(ctx, opts.since);
    const workouts = await fetchWhoopWorkouts(ctx, opts.since);

    const sleepById = new Map(sleeps.map((s) => [s.id, s]));
    const cycleById = new Map(cycles.map((c) => [c.id, c]));

    const snapshotRows: Record<string, unknown>[] = [];
    for (const recovery of recoveries) {
      if (!recovery.score) continue; // PENDING_SCORE/UNSCORABLE — nothing to write yet

      const cycle = cycleById.get(recovery.cycle_id);
      // A cycle with no `end` is still in progress; day attribution needs a
      // concrete end instant, so this recovery is skipped until it does.
      if (!cycle?.end || !cycle.score) continue;

      const sleep = sleepById.get(recovery.sleep_id);
      if (!sleep?.score) continue;

      const stages = sleep.score.stage_summary;
      const deepSec = Math.round(stages.total_slow_wave_sleep_time_milli / 1000);
      const remSec = Math.round(stages.total_rem_sleep_time_milli / 1000);
      const lightSec = Math.round(stages.total_light_sleep_time_milli / 1000);

      snapshotRows.push({
        user_id: userId,
        // Day attribution: the LOCAL day (home timezone) of the CYCLE'S
        // END, not the recovery/sleep record's own timestamp — per
        // task-8-brief.md's "Day attribution" note.
        day: localDayOf(new Date(cycle.end), tz),
        recovery_pct: Math.round(recovery.score.recovery_score),
        hrv_ms: recovery.score.hrv_rmssd_milli,
        rhr: Math.round(recovery.score.resting_heart_rate),
        day_strain: cycle.score.strain,
        sleep: {
          deepSec,
          remSec,
          lightSec,
          // efficiencyPct and sleepScorePct are DISTINCT Whoop metrics
          // (time-asleep ratio vs. the app's "Sleep Score") — never
          // conflate them (hard-won Phase-1 invariant).
          efficiencyPct: sleep.score.sleep_efficiency_percentage,
          sleepScorePct: sleep.score.sleep_performance_percentage,
          // Total time asleep, derived from the same three stage fields
          // (not a separately-fetched API value) so it can never drift
          // from deepSec+remSec+lightSec by construction.
          durationSec: deepSec + remSec + lightSec,
        },
        source: "whoop",
        synced_at: new Date().toISOString(),
      });
    }

    if (snapshotRows.length > 0) {
      const { error } = await admin
        .from("recovery_snapshots")
        .upsert(snapshotRows, { onConflict: "user_id,day" });
      if (error) throw error;
    }

    const activityRows = workouts
      .filter((w) => w.score)
      .map((w) => ({
        user_id: userId,
        whoop_id: w.id,
        sport: w.sport_name,
        started_at: w.start,
        ended_at: w.end,
        strain: w.score!.strain,
        avg_hr: Math.round(w.score!.average_heart_rate),
        max_hr: Math.round(w.score!.max_heart_rate),
        hr_zones: w.score!.zone_durations ?? null,
      }));

    if (activityRows.length > 0) {
      // whoop_id is globally unique (see 0001_schema.sql); ignoreDuplicates
      // turns this into ON CONFLICT DO NOTHING, so a whoop_id that already
      // exists is silently skipped rather than erroring or duplicating —
      // idempotent re-sync. Strava/Whoop cross-source dedupe is Task 11.
      const { error } = await admin
        .from("activities")
        .upsert(activityRows, { onConflict: "whoop_id", ignoreDuplicates: true });
      if (error) throw error;
    }

    return finish(admin, userId, { ok: true, items: snapshotRows.length + activityRows.length });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return finish(admin, userId, { ok: false, items: 0, detail });
  }
}

async function loadHomeTimezone(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("home_timezone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { home_timezone?: string } | null)?.home_timezone ?? DEFAULT_HOME_TIMEZONE;
}

/** Writes a sync_runs row unconditionally (success or failure) and returns `result` unchanged. */
async function finish(admin: SupabaseClient, userId: string, result: SyncResult): Promise<SyncResult> {
  const { error } = await admin.from("sync_runs").insert({
    user_id: userId,
    source: "whoop",
    ok: result.ok,
    items: result.items,
    detail: result.detail ?? null,
  });
  if (error) throw error;
  return result;
}
