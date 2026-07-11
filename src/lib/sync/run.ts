"use server";

import { z } from "zod";
import { getServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { syncWhoop } from "@/lib/integrations/whoop/sync";
import { STALE_RECOVERY_MS } from "@/lib/sync/staleness";

/**
 * On-open staleness refresh (Task 9). Invoked once per app mount from the
 * `(tabs)` layout's client boundary, fire-and-forget (supabase mode only —
 * see that layout's useEffect).
 *
 * Controller resolution on the RLS-vs-admin-client plan tension
 * (task-9-brief.md / p2-globals.md): p2-globals says the service-role key
 * is for cron/webhook handlers "(no user session there)", but this is a
 * user-invoked server action that must call `syncWhoop`, which needs the
 * admin client (`integration_tokens` is RLS deny-all — see
 * supabase/migrations/0001_schema.sql). Binding resolution: user-driven
 * DATA reads/writes stay RLS-scoped; sync is a system operation regardless
 * of trigger. So this function (1) resolves the session user via
 * `getServerClient().auth.getUser()` and returns early if unauthenticated,
 * and only then (2) runs `syncWhoop(getAdminClient(), user.id, ...)`
 * strictly scoped to that authenticated user's own id — never any other
 * user's data, and the admin client's results never leave this function
 * (return type is `void`; the caller only ever sees "done", success or
 * failure alike — errors are swallowed here rather than propagated, per
 * the brief's "errors swallowed into staleInfo": a failed background
 * refresh degrades to "last known data", not a thrown error the UI has to
 * handle).
 *
 * Only "whoop" is a real source until Task 11 adds Strava — checking one
 * source's last-ok `sync_runs` row against `STALE_RECOVERY_MS` (3h) is the
 * full staleness check for now; Task 11 extends this per-source.
 */

const lastOkRunRowSchema = z.object({ ran_at: z.string() });

export async function refreshIfStale(): Promise<void> {
  try {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const admin = getAdminClient();

    const { data, error } = await admin
      .from("sync_runs")
      .select("ran_at")
      .eq("user_id", user.id)
      .eq("source", "whoop")
      .eq("ok", true)
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const lastOkMs = data ? new Date(lastOkRunRowSchema.parse(data).ran_at).getTime() : 0;
    const isStale = Date.now() - lastOkMs > STALE_RECOVERY_MS;
    if (!isStale) return;

    await syncWhoop(admin, user.id);
  } catch {
    // Swallowed: this is a best-effort background refresh (fire-and-forget
    // from the tabs layout's useEffect). A failure here just means the
    // screens keep showing whatever data/staleInfo they already had —
    // never an unhandled rejection or a thrown error the UI must catch.
  }
}
