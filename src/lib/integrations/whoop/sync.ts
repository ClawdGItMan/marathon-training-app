import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeStrava, whoopSideRowSchema } from "@/lib/activities/dedupe";
import { loadTokens } from "@/lib/integrations/oauth";
import { localDayOf } from "@/lib/sync/timezone";
import { errorMessage } from "@/lib/util/error-message";
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
 *
 * WRITE SHAPE IS THE READ CONTRACT (controller plan amendment, fix loop 1):
 * every row written here must parse through row-mappers.ts's
 * `recoveryRowSchema`/`rowToRecovery` — the mapper every screen reads
 * through. Concretely: `sleep` jsonb is {respRate, durationMin, needMin,
 * efficiencyPct, sleepScorePct, deepMin, remMin, lightMin} in MINUTES, and
 * `payload` jsonb is {recoveryDelta, hrvDeltaPct, rhrDelta, loadLabel}
 * computed at sync time against the stored previous-day row. A round-trip
 * test (sync's upserted row -> rowToRecovery) pins this compatibility.
 */

export type SyncResult = { ok: boolean; items: number; detail?: string };

const DEFAULT_HOME_TIMEZONE = "America/New_York";

/**
 * Day-strain -> loadLabel mapping. The seed's label vocabulary is binary —
 * "moderate" | "elevated" (src/lib/data/seed.ts, all 7 recovery rows) —
 * with "elevated" marking a meaningfully-above-normal load day. The seed's
 * numeric `load` values sit on a ~1.0-centered ratio scale (elevated at
 * >= 1.18, moderate at <= 1.12 -> boundary ~1.15), but this sync stores
 * Whoop day strain (0-21 scale) in `day_strain`, so the boundary must live
 * on that scale. Two independent derivations agree on 14: (a) WHOOP itself
 * categorizes strain 14-17.9 as "Strenuous" (10-13.9 "Moderate"), and
 * (b) the seed's ~1.15 ratio boundary applied to a typical active-day
 * strain of ~12 lands at ~14. Rest/light days share "moderate" because the
 * seed vocabulary has no third label (its own 0.95-ratio recovery-day row
 * is labeled "moderate").
 */
export const ELEVATED_DAY_STRAIN_THRESHOLD = 14;

export function loadLabelFor(dayStrain: number): string {
  return dayStrain >= ELEVATED_DAY_STRAIN_THRESHOLD ? "elevated" : "moderate";
}

/** Calendar-date arithmetic on the YYYY-MM-DD string itself — no timezone involved. */
function dayBefore(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

// DB-boundary schema for the previous-day delta lookup (Zod parse at every
// boundary, per p2-globals.md). Metric columns are nullable in the DDL; a
// null metric is treated the same as a missing row for that delta (-> 0).
const prevSnapshotRowSchema = z.object({
  recovery_pct: z.number().nullable(),
  hrv_ms: z.number().nullable(),
  rhr: z.number().nullable(),
});

// ---- since anchor (I5, mirrors strava/sync.ts's lastOkStravaSync) -----------

/**
 * Lookback subtracted from the last-ok anchor. Why not anchor at lastOk
 * exactly: (a) dedupe's crash-window self-healing relies on RE-FETCHING —
 * if a rotated-token crash or a mid-merge crash left a workout deleted or
 * half-processed, only a fetch window that still covers it can re-insert
 * and re-merge it (see dedupe.ts's "self-healing" note); (b) Whoop scores
 * arrive late and records get edited after the fact — 7 days comfortably
 * covers late-arriving edits without re-pulling full history every morning.
 */
export const WHOOP_SYNC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const lastSyncRowSchema = z.object({ ran_at: z.string() });

/** Latest successful (`ok=true`) `whoop` sync_runs row's `ran_at` for `userId`, or `undefined` if never synced ok. */
async function lastOkWhoopSync(admin: SupabaseClient, userId: string): Promise<Date | undefined> {
  const { data, error } = await admin
    .from("sync_runs")
    .select("ran_at")
    .eq("user_id", userId)
    .eq("source", "whoop")
    .eq("ok", true)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return new Date(lastSyncRowSchema.parse(data).ran_at);
}

/** `lastOk - 7d lookback`, or `undefined` (full history) on a first-ever sync. */
async function anchoredWhoopSince(admin: SupabaseClient, userId: string): Promise<Date | undefined> {
  const lastOk = await lastOkWhoopSync(admin, userId);
  return lastOk ? new Date(lastOk.getTime() - WHOOP_SYNC_LOOKBACK_MS) : undefined;
}

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

    // I5: no explicit `since` -> anchor to the last successful whoop sync
    // (minus the 7d lookback), mirroring syncStrava's `opts.after ??
    // lastOkStravaSync` — so BOTH callers (the morning cron and
    // refreshIfStale) stop re-pulling full history on every run. A
    // first-ever sync (no ok row) stays full-history.
    const since = opts.since ?? (await anchoredWhoopSince(admin, userId));

    // Sequential, not Promise.all: whoopFetch mutates ctx.tokens in place on
    // a 401-triggered refresh, and Whoop rotates the refresh token on every
    // use. Concurrent calls could each observe a 401 and race to refresh
    // with the same (single-use) refresh token, and the loser would fail.
    // Sequential calls guarantee at most one refresh per sync run.
    const recoveries = await fetchWhoopRecoveries(ctx, since);
    const sleeps = await fetchWhoopSleeps(ctx, since);
    const cycles = await fetchWhoopCycles(ctx, since);
    const workouts = await fetchWhoopWorkouts(ctx, since);

    const sleepById = new Map(sleeps.map((s) => [s.id, s]));
    const cycleById = new Map(cycles.map((c) => [c.id, c]));

    const snapshots: SnapshotBase[] = [];
    for (const recovery of recoveries) {
      if (!recovery.score) continue; // PENDING_SCORE/UNSCORABLE — nothing to write yet

      const cycle = cycleById.get(recovery.cycle_id);
      // A cycle with no `end` is still in progress; day attribution needs a
      // concrete end instant, so this recovery is skipped until it does.
      if (!cycle?.end || !cycle.score) continue;

      const sleep = sleepById.get(recovery.sleep_id);
      if (!sleep?.score) continue;

      const stages = sleep.score.stage_summary;
      const need = sleep.score.sleep_needed;
      // Rounding convention: each stage is independently rounded to whole
      // minutes, and durationMin is the sum of those already-rounded values
      // — matching the seed's durationMin = deepMin+remMin+lightMin identity
      // by construction (it can never drift from the parts).
      const deepMin = Math.round(stages.total_slow_wave_sleep_time_milli / 60_000);
      const remMin = Math.round(stages.total_rem_sleep_time_milli / 60_000);
      const lightMin = Math.round(stages.total_light_sleep_time_milli / 60_000);
      const needMin = Math.round(
        (need.baseline_milli +
          need.need_from_sleep_debt_milli +
          need.need_from_recent_strain_milli +
          need.need_from_recent_nap_milli) /
          60_000
      );

      snapshots.push({
        // Day attribution: the LOCAL day (home timezone) of the CYCLE'S
        // END, not the recovery/sleep record's own timestamp — per
        // task-8-brief.md's "Day attribution" note.
        day: localDayOf(new Date(cycle.end), tz),
        recovery_pct: Math.round(recovery.score.recovery_score),
        hrv_ms: recovery.score.hrv_rmssd_milli,
        rhr: Math.round(recovery.score.resting_heart_rate),
        day_strain: cycle.score.strain,
        sleep: {
          respRate: sleep.score.respiratory_rate,
          durationMin: deepMin + remMin + lightMin,
          needMin,
          // efficiencyPct and sleepScorePct are DISTINCT Whoop metrics
          // (time-asleep ratio vs. the app's "Sleep Score") — never
          // conflate them (hard-won Phase-1 invariant).
          efficiencyPct: sleep.score.sleep_efficiency_percentage,
          sleepScorePct: sleep.score.sleep_performance_percentage,
          deepMin,
          remMin,
          lightMin,
        },
      });
    }

    // Ascending-day order, upserted one at a time: each day's payload deltas
    // are computed against the previous day's STORED row, so in a multi-day
    // backfill day N must be in the database before day N+1's deltas are
    // computed. (Whoop returns collections newest-first — the sort is
    // load-bearing, not cosmetic.) Per-row upserts also make two cycles
    // ending on the same local day a plain overwrite instead of a
    // same-batch ON CONFLICT error.
    snapshots.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    for (const snapshot of snapshots) {
      const payload = await computePayload(admin, userId, snapshot);
      const { error } = await admin.from("recovery_snapshots").upsert(
        {
          user_id: userId,
          ...snapshot,
          payload,
          source: "whoop",
          synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id,day" }
      );
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
      // idempotent re-sync. The `.select()` makes Postgres RETURN exactly
      // the rows it actually INSERTED (ON CONFLICT DO NOTHING ... RETURNING
      // omits skipped duplicates) — which is precisely the set that must be
      // checked against pre-existing Strava rows below, with no rescan of
      // already-processed workouts on every morning sync.
      const { data, error } = await admin
        .from("activities")
        .upsert(activityRows, { onConflict: "whoop_id", ignoreDuplicates: true })
        .select();
      if (error) throw error;

      // Reverse dedupe trigger (Task 11 fix loop 1): each NEWLY-inserted
      // run-equivalent workout checks for a pre-existing overlapping Strava
      // row and merges into it (the Strava row survives; this Whoop row is
      // deleted) — closing the webhook-first ordering hole where a Strava
      // webhook import lands before the Whoop workout ever syncs, which the
      // forward-only dedupe could never heal (see dedupe.ts's module
      // comment). No-ops per row when nothing overlaps or the sport isn't
      // run-equivalent, so pre-fix behavior is unchanged in those cases.
      const inserted = z.array(whoopSideRowSchema).parse(data ?? []);
      for (const row of inserted) {
        await dedupeStrava(admin, userId, row);
      }
    }

    // M1: `await` is load-bearing — without it a rejected finish (the
    // sync_runs bookkeeping insert failing) escapes this try and the caller
    // gets a throw instead of the documented never-throws SyncResult.
    return await finish(admin, userId, { ok: true, items: snapshots.length + activityRows.length });
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

/** The per-day metrics a snapshot row carries before its payload is computed. */
type SnapshotBase = {
  day: string;
  recovery_pct: number;
  hrv_ms: number;
  rhr: number;
  day_strain: number;
  sleep: {
    respRate: number;
    durationMin: number;
    needMin: number;
    efficiencyPct: number;
    sleepScorePct: number;
    deepMin: number;
    remMin: number;
    lightMin: number;
  };
};

/**
 * Builds the payload jsonb {recoveryDelta, hrvDeltaPct, rhrDelta, loadLabel}
 * for a snapshot. Deltas compare today's values against the PREVIOUS
 * calendar day's stored `recovery_snapshots` row (read back through the
 * admin client, never from in-memory sync state — re-running the sync for
 * the same day therefore recomputes identical values). Conventions, all
 * matching the seed data (src/lib/data/seed.ts):
 * - recoveryDelta / rhrDelta: plain integer difference vs yesterday (the
 *   seed's values reproduce exactly as consecutive-day differences).
 * - hrvDeltaPct: integer-rounded percent change vs yesterday's stored
 *   (unrounded) hrv_ms.
 * - No previous-day row (or a null metric on it): 0. The payload/domain
 *   schemas force `z.number()` — no null convention exists anywhere in the
 *   seed or mappers, so 0 ("no change to report") is the least-surprising
 *   in-band value.
 */
async function computePayload(
  admin: SupabaseClient,
  userId: string,
  snapshot: SnapshotBase
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from("recovery_snapshots")
    .select("recovery_pct, hrv_ms, rhr")
    .eq("user_id", userId)
    .eq("day", dayBefore(snapshot.day))
    .maybeSingle();
  if (error) throw error;

  const prev = data ? prevSnapshotRowSchema.parse(data) : null;

  return {
    recoveryDelta: prev?.recovery_pct != null ? snapshot.recovery_pct - prev.recovery_pct : 0,
    hrvDeltaPct:
      prev?.hrv_ms != null && prev.hrv_ms > 0
        ? Math.round(((snapshot.hrv_ms - prev.hrv_ms) / prev.hrv_ms) * 100)
        : 0,
    rhrDelta: prev?.rhr != null ? snapshot.rhr - prev.rhr : 0,
    loadLabel: loadLabelFor(snapshot.day_strain),
  };
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
