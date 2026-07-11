/**
 * Live smoke check for the Whoop integration (Task 14 ⚑ deploy checkpoint —
 * requires a real, already-connected Whoop account; NOT run in CI/tests,
 * and cannot be exercised in this environment since no live Whoop
 * credentials exist yet — see task-14-report.md).
 *
 * Run: npm run smoke:whoop
 *   (equivalent to `NODE_OPTIONS=--conditions=react-server npx tsx
 *   scripts/smoke-whoop.ts` — the `--conditions=react-server` is required,
 *   not optional: this script's transitive imports include
 *   src/lib/supabase/admin.ts, which itself imports the `server-only`
 *   npm package. That package's `exports` map resolves to a no-op ONLY
 *   under the "react-server" condition (how Next's own RSC bundler marks
 *   genuinely-server code); every other resolution — including a plain
 *   `tsx`/Node process with no flag — gets its unconditional-throw
 *   `index.js`. Next's build sets that condition itself; a bare CLI
 *   invocation must set it explicitly, hence the npm script.)
 *
 * Loads the sole profile's stored Whoop tokens via the admin client
 * (bypassing RLS — same access pattern as the cron sync and the webhook
 * route; see src/lib/supabase/admin.ts), then calls all four v2 collection
 * fetchers once each, scoped to the last `SMOKE_WINDOW_DAYS` (recent-window
 * smoke check, not a full historical pull — see scripts/lib/smoke.ts), and
 * prints the record count each returned.
 *
 * READ-ONLY FOR BUSINESS DATA: this script never writes to activities,
 * recovery_snapshots, planned_sessions, sync_runs, or any other app table —
 * no sync bookkeeping, no upserts. The ONE write it may perform: if the
 * stored access token has expired, the shared auto-refresh path (oauth.ts's
 * `fetchWithAutoRefresh` — the exact same path the cron sync uses) rotates
 * the token pair and persists it to `integration_tokens` before retrying.
 * That persist is required, not optional: Whoop rotates the refresh token
 * on every use, so refreshing without persisting would brick the stored
 * connection, and failing closed on a 401 would make this smoke report
 * failure for a perfectly healthy integration whose access token merely
 * expired — a false negative at exactly the deploy-checkpoint moment it
 * exists for. So a smoke run after token expiry both succeeds AND updates
 * the stored tokens — by design. The script exists to prove live
 * connectivity end to end (the stored OAuth token is still usable,
 * refreshing it still works, and whoop/wire.ts's Zod schemas still match
 * Whoop's actual response shape) without touching production business
 * data. For an actual sync, use the cron route or the Settings screen, not
 * this script.
 *
 * Exit codes: 0 on success (all four fetchers returned, counts printed to
 * stdout); 1 on any failure — missing env, no profile/no stored tokens, or
 * a live API/parse error — with an actionable message on stderr identifying
 * which.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { loadTokens } from "@/lib/integrations/oauth";
import {
  fetchWhoopCycles,
  fetchWhoopRecoveries,
  fetchWhoopSleeps,
  fetchWhoopWorkouts,
  type WhoopAuthContext,
} from "@/lib/integrations/whoop/client";
import {
  envErrorMessage,
  errorMessage,
  isMainModule,
  missingEnvVars,
  requireSoleProfileId,
  smokeSinceDate,
  type EnvLike,
  type SmokeResult,
} from "./lib/smoke";

/**
 * Superset of what the happy path touches: the four fetchers only read
 * NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (admin client) and
 * TOKEN_ENCRYPTION_KEY (loadTokens' decrypt), but a 401 mid-run triggers a
 * refresh that needs WHOOP_CLIENT_ID/SECRET too (see oauth.ts's
 * fetchWithAutoRefresh) — checked upfront so a refresh-time failure never
 * surfaces as a confusing generic crash instead of this actionable message.
 */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "WHOOP_CLIENT_ID",
  "WHOOP_CLIENT_SECRET",
] as const;

export type WhoopSmokeDeps = {
  admin: SupabaseClient;
  loadTokens: typeof loadTokens;
  fetchWhoopRecoveries: typeof fetchWhoopRecoveries;
  fetchWhoopSleeps: typeof fetchWhoopSleeps;
  fetchWhoopCycles: typeof fetchWhoopCycles;
  fetchWhoopWorkouts: typeof fetchWhoopWorkouts;
};

/**
 * Runs the smoke check against injected `deps` — production deps come from
 * `productionDeps()` below (used only by this file's CLI entry point);
 * tests/unit/smoke-whoop.test.ts injects fakes directly, no module mocking
 * required. Never throws: every failure mode (env, profile/tokens, API)
 * resolves to `{ ok: false, message }` so `main()` is the sole place that
 * calls `process.exit`.
 */
export async function runWhoopSmoke(deps: WhoopSmokeDeps, env: EnvLike = process.env): Promise<SmokeResult> {
  const missing = missingEnvVars(REQUIRED_ENV, env);
  if (missing.length > 0) {
    return { ok: false, message: envErrorMessage(missing) };
  }

  let userId: string;
  try {
    userId = await requireSoleProfileId(deps.admin);
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }

  const tokens = await deps.loadTokens(userId, "whoop");
  if (!tokens) {
    return {
      ok: false,
      message:
        "Whoop is not connected for this account. Connect it via Settings " +
        "on the deployed app, then re-run this check.",
    };
  }

  const ctx: WhoopAuthContext = { userId, tokens: { access: tokens.access, refresh: tokens.refresh } };
  const since = smokeSinceDate();

  try {
    // Sequential, not concurrent: mirrors whoop/sync.ts's syncWhoop exactly
    // — a 401 mid-run mutates ctx.tokens in place via fetchWithAutoRefresh,
    // and Whoop rotates the refresh token on every use, so concurrent calls
    // could race to refresh with the same single-use refresh token.
    const recoveries = await deps.fetchWhoopRecoveries(ctx, since);
    const sleeps = await deps.fetchWhoopSleeps(ctx, since);
    const cycles = await deps.fetchWhoopCycles(ctx, since);
    const workouts = await deps.fetchWhoopWorkouts(ctx, since);

    return {
      ok: true,
      message:
        `Whoop OK (last ${Math.round((Date.now() - since.getTime()) / 86_400_000)}d) — ` +
        `recoveries: ${recoveries.length}, sleeps: ${sleeps.length}, ` +
        `cycles: ${cycles.length}, workouts: ${workouts.length}.`,
    };
  } catch (err) {
    return { ok: false, message: `Whoop API error: ${errorMessage(err)}` };
  }
}

/**
 * The CLI entry point's real wiring. Exported (though only `main()` below
 * calls it at runtime) so tests/unit/smoke-whoop.test.ts can structurally
 * pin that the smoke run funnels through the SHARED fetchers/loadTokens —
 * the ones whose 401-refresh path persists a rotated token pair — rather
 * than some bespoke fetch that would silently invalidate the header
 * comment's "read-only for business data, may rotate tokens" contract.
 */
export function productionDeps(): WhoopSmokeDeps {
  return {
    admin: getAdminClient(),
    loadTokens,
    fetchWhoopRecoveries,
    fetchWhoopSleeps,
    fetchWhoopCycles,
    fetchWhoopWorkouts,
  };
}

async function main(): Promise<void> {
  // Checked here too (runWhoopSmoke re-checks internally) specifically so
  // `productionDeps()` — which calls `getAdminClient()`, itself throwing on
  // missing Supabase env — is never invoked before the actionable env
  // message has a chance to print.
  const missing = missingEnvVars(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(envErrorMessage(missing));
    process.exit(1);
    return;
  }

  const result = await runWhoopSmoke(productionDeps());
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
  }
  process.exit(result.ok ? 0 : 1);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(errorMessage(err));
    process.exit(1);
  });
}
