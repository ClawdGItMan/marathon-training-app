"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { syncWhoop } from "@/lib/integrations/whoop/sync";
import { syncStrava } from "@/lib/integrations/strava/sync";
import { STALE_ACTIVITIES_MS, STALE_RECOVERY_MS } from "@/lib/sync/staleness";

/**
 * On-open staleness refresh (Task 9; extended per-source for Strava by
 * Task 11 per this file's own prior forward-reference comment: "Only
 * 'whoop' is a real source until Task 11 adds Strava ... Task 11 extends
 * this per-source"). Invoked once per app mount from the `(tabs)` layout's
 * client boundary, fire-and-forget (supabase mode only — see that layout's
 * useEffect).
 *
 * Controller resolution on the RLS-vs-admin-client plan tension
 * (task-9-brief.md / p2-globals.md): p2-globals says the service-role key
 * is for cron/webhook handlers "(no user session there)", but this is a
 * user-invoked server action that must call `syncWhoop`/`syncStrava`, which
 * need the admin client (`integration_tokens` is RLS deny-all — see
 * supabase/migrations/0001_schema.sql). Binding resolution: user-driven
 * DATA reads/writes stay RLS-scoped; sync is a system operation regardless
 * of trigger. So this function (1) resolves the session user via
 * `getServerClient().auth.getUser()` and returns early if unauthenticated,
 * and only then (2) runs each source's sync strictly scoped to that
 * authenticated user's own id — never any other user's data, and the admin
 * client's results never leave this function (return type is `void`).
 *
 * Each source's staleness check + sync attempt is independently
 * try/caught: a Whoop failure must not prevent a stale Strava check (or
 * vice versa) — see `refreshSourceIfStale` — and any failure degrades to
 * "last known data" (per the brief's "errors swallowed into staleInfo"),
 * never a thrown error the UI has to handle. Recovery uses
 * `STALE_RECOVERY_MS` (3h); activities (Strava runs) use the tighter
 * `STALE_ACTIVITIES_MS` (1h) — both from p2-globals.md's staleness
 * thresholds.
 */

const lastOkRunRowSchema = z.object({ ran_at: z.string() });

async function lastOkRanAtMs(admin: SupabaseClient, userId: string, source: "whoop" | "strava"): Promise<number> {
  const { data, error } = await admin
    .from("sync_runs")
    .select("ran_at")
    .eq("user_id", userId)
    .eq("source", source)
    .eq("ok", true)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return data ? new Date(lastOkRunRowSchema.parse(data).ran_at).getTime() : 0;
}

async function refreshSourceIfStale(
  admin: SupabaseClient,
  userId: string,
  source: "whoop" | "strava",
  thresholdMs: number,
  run: () => Promise<unknown>
): Promise<void> {
  try {
    const lastOkMs = await lastOkRanAtMs(admin, userId, source);
    if (Date.now() - lastOkMs <= thresholdMs) return;
    await run();
  } catch {
    // Swallowed independently per source — see module doc comment.
  }
}

export async function refreshIfStale(): Promise<void> {
  let admin: SupabaseClient;
  let userId: string;
  try {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    userId = user.id;
    admin = getAdminClient();
  } catch {
    return;
  }

  await refreshSourceIfStale(admin, userId, "whoop", STALE_RECOVERY_MS, () => syncWhoop(admin, userId));
  await refreshSourceIfStale(admin, userId, "strava", STALE_ACTIVITIES_MS, () => syncStrava(admin, userId));
}
