import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | undefined;

/**
 * Service-role Supabase client. Bypasses RLS entirely, so it must ONLY be
 * used from server code with no user session to scope against — cron jobs,
 * webhook handlers, and the OAuth callback routes' `integration_tokens`
 * reads/writes (see that table's deny-all RLS policy in
 * supabase/migrations/0001_schema.sql: zero policies for authenticated/anon,
 * service-role only). Never call this from a user-driven read/write path —
 * those go through the RLS-scoped `getBrowserClient()`/`getServerClient()`.
 *
 * `import "server-only"` makes any accidental client-bundle inclusion of
 * this module (or anything that imports it) fail at build time.
 */
export function getAdminClient(): SupabaseClient {
  if (!cached) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      throw new Error(
        "getAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
          "must both be set (misconfiguration)."
      );
    }

    cached = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return cached;
}
