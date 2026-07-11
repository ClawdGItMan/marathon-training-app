import { z } from "zod";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Staleness thresholds for sync-derived data (Task 8 / p2-globals.md Global
 * Constraints: "recovery > 3h, activities > 1h"). Consumed by Task 12's
 * `StaleMarker` component and any freshness checks in the sync layer.
 */
export const STALE_RECOVERY_MS = 3 * 3600e3;
export const STALE_ACTIVITIES_MS = 3600e3;

// ---- getSyncStatus (Task 12) -------------------------------------------------

export type SyncSource = "whoop" | "strava";
export type SyncStatus = Record<SyncSource, { lastOkAt: Date | null; authBroken: boolean }>;

const syncRunRowSchema = z.object({ ok: z.boolean(), detail: z.string().nullable(), ran_at: z.string() });

/**
 * The ONLY signal available for "auth broken" (controller-acknowledged
 * honesty gap — see task-12-report.md): whoop/sync.ts's and strava/sync.ts's
 * `finish()` writes `sync_runs.detail` from a plain `catch (err) { detail =
 * err instanceof Error ? err.message : String(err) }` — there is no
 * structured error taxonomy anywhere in the sync layer, so this can't
 * distinguish "token rejected" from "provider had an outage" by type, only
 * by matching the message text those specific throw sites actually produce.
 * The two throw sites that fire on a genuinely bad/expired token are
 * whoop/client.ts's & strava/client.ts's `*Fetch` ("... request failed: 401
 * Unauthorized (...)" — the SECOND attempt, after fetchWithAutoRefresh's
 * one 401-triggered refresh-and-retry already failed) and `requestToken`
 * ("... token request failed: ${status} ${statusText}" when the refresh
 * grant itself is rejected). A refused refresh grant more typically comes
 * back 400 (OAuth2 `invalid_grant`) than 401, and neither provider's client
 * code tags that case any differently from "token expired, needs refresh"
 * — so matching only `401` is deliberately conservative: it will under-flag
 * some genuinely broken refresh tokens (400-refusal case) rather than
 * over-flag transient 5xx/network hiccups as "reconnect now". A "closest
 * honest version" given what the writers actually distinguish today, not a
 * complete auth-failure taxonomy.
 */
const AUTH_FAILURE_PATTERN = /\b401\b/;

/** Single most recent `sync_runs` row for `source`, optionally restricted to `ok = true`, or null if none exist. */
async function latestSyncRow(
  source: SyncSource,
  okOnly: boolean
): Promise<{ ok: boolean; detail: string | null; ran_at: string } | null> {
  let query = getBrowserClient().from("sync_runs").select("ok, detail, ran_at").eq("source", source);
  if (okOnly) query = query.eq("ok", true);
  const { data, error } = await query.order("ran_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? syncRunRowSchema.parse(data) : null;
}

async function sourceSyncStatus(source: SyncSource): Promise<SyncStatus[SyncSource]> {
  const [latest, lastOk] = await Promise.all([latestSyncRow(source, false), latestSyncRow(source, true)]);
  return {
    lastOkAt: lastOk ? new Date(lastOk.ran_at) : null,
    authBroken: latest ? !latest.ok && AUTH_FAILURE_PATTERN.test(latest.detail ?? "") : false,
  };
}

/**
 * Per-source sync health for Task 12's `StaleMarker` (staleness) and
 * `ConnectionRow` (RECONNECT). Reads `sync_runs` via the RLS-scoped browser
 * client (NOT the admin client) — this is a user-driven read, and
 * `sync_runs` carries a user-keyed RLS policy (see
 * supabase/migrations/0001_schema.sql's `sync_runs_own` policy), so RLS
 * alone correctly scopes every query to the signed-in user without an
 * explicit `user_id` filter — the same pattern supabase-repo.ts's plain
 * reads (getGoal, getBlock, ...) already use.
 *
 * Local mode (`NEXT_PUBLIC_REPO_MODE` unset/local) returns all-fresh
 * (`lastOkAt: now`, `authBroken: false` for both sources) WITHOUT touching
 * Supabase at all — there is no sync concept in local mode, and the
 * Phase-1 e2e suite (42 tests, local-repo mode) must render byte-identical
 * screens, so this must be a true early return, not a code path that
 * happens to resolve falsy.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  if (process.env.NEXT_PUBLIC_REPO_MODE !== "supabase") {
    const now = new Date();
    return { whoop: { lastOkAt: now, authBroken: false }, strava: { lastOkAt: now, authBroken: false } };
  }

  const [whoop, strava] = await Promise.all([sourceSyncStatus("whoop"), sourceSyncStatus("strava")]);
  return { whoop, strava };
}
