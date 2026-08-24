/**
 * Live smoke check for the Strava integration (Task 14 ⚑ deploy checkpoint —
 * requires a real, already-connected Strava account; NOT run in CI/tests,
 * and cannot be exercised in this environment since no live Strava
 * credentials exist yet — see task-14-report.md).
 *
 * Run: npm run smoke:strava
 *   (equivalent to `NODE_OPTIONS=--conditions=react-server npx tsx
 *   scripts/smoke-strava.ts` — the `--conditions=react-server` is
 *   required, not optional; see scripts/smoke-whoop.ts's header comment
 *   for the full reason, which applies identically here.)
 *
 * Loads the sole profile's stored Strava tokens via the admin client
 * (bypassing RLS — same access pattern as the cron sync and the webhook
 * route; see src/lib/supabase/admin.ts), then:
 *   1. calls `listActivities` once, scoped to the last `SMOKE_WINDOW_DAYS`
 *      (recent-window smoke check, not a full historical pull — see
 *      scripts/lib/smoke.ts; unlike the cron sync's "since last successful
 *      sync" semantics, which would make a first-ever run pull the
 *      account's ENTIRE history);
 *   2. if that returned at least one activity, also calls `getActivity` for
 *      the first one — the single-activity fetcher the webhook route uses
 *      on every create/update event — to smoke-test that code path too. A
 *      zero-activity window skips this (reported, not a failure: an
 *      inactive-for-30-days account is a valid state, not a broken one).
 *
 * READ-ONLY FOR BUSINESS DATA: this script never writes to activities,
 * recovery_snapshots, planned_sessions, sync_runs, or any other app table —
 * no sync bookkeeping, no upserts. The ONE write it may perform: if the
 * stored access token has expired, the shared auto-refresh path (oauth.ts's
 * `fetchWithAutoRefresh` — the exact same path the cron sync uses) rotates
 * the token pair and persists it to `integration_tokens` before retrying.
 * See scripts/smoke-whoop.ts's header for the full rationale (Strava also
 * rotates the refresh token on successful refresh, so the persist is
 * required for crash-safety, and failing closed on a 401 would false-
 * negative a healthy integration whose access token merely expired) — it
 * applies identically here. The script exists to prove live connectivity
 * end to end (the stored OAuth token is still usable, refreshing it still
 * works, and strava/wire.ts's Zod schemas still match Strava's actual
 * response shape) without touching production business data. For an actual
 * import, use the webhook route, the cron route, or the Settings screen,
 * not this script.
 *
 * Exit codes: 0 on success; 1 on any failure — missing env, no profile/no
 * stored tokens, or a live API/parse error — with an actionable message on
 * stderr identifying which.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { loadTokens } from "@/lib/integrations/oauth";
import { getActivity, listActivities, type StravaAuthContext } from "@/lib/integrations/strava/client";
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
 * Superset of what the happy path touches: `listActivities`/`getActivity`
 * only read NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (admin
 * client) and TOKEN_ENCRYPTION_KEY (loadTokens' decrypt), but a 401
 * mid-run triggers a refresh that needs STRAVA_CLIENT_ID/SECRET too (see
 * oauth.ts's fetchWithAutoRefresh) — checked upfront so a refresh-time
 * failure never surfaces as a confusing generic crash instead of this
 * actionable message.
 */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "STRAVA_CLIENT_ID",
  "STRAVA_CLIENT_SECRET",
] as const;

export type StravaSmokeDeps = {
  admin: SupabaseClient;
  loadTokens: typeof loadTokens;
  listActivities: typeof listActivities;
  getActivity: typeof getActivity;
};

/**
 * Runs the smoke check against injected `deps` — production deps come from
 * `productionDeps()` below (used only by this file's CLI entry point);
 * tests/unit/smoke-strava.test.ts injects fakes directly, no module
 * mocking required. Never throws: every failure mode (env, profile/tokens,
 * API) resolves to `{ ok: false, message }` so `main()` is the sole place
 * that calls `process.exit`. Mirrors scripts/smoke-whoop.ts's shape exactly
 * — see that file for the fuller rationale, not repeated here.
 */
export async function runStravaSmoke(deps: StravaSmokeDeps, env: EnvLike = process.env): Promise<SmokeResult> {
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

  const tokens = await deps.loadTokens(userId, "strava");
  if (!tokens) {
    return {
      ok: false,
      message:
        "Strava is not connected for this account. Connect it via Settings " +
        "on the deployed app, then re-run this check.",
    };
  }

  const ctx: StravaAuthContext = {
    userId,
    tokens: { access: tokens.access, refresh: tokens.refresh },
    athleteRef: tokens.athleteRef ?? null,
  };
  const since = smokeSinceDate();

  try {
    const activities = await deps.listActivities(ctx, { after: since });
    const windowDays = Math.round((Date.now() - since.getTime()) / 86_400_000);

    if (activities.length === 0) {
      return {
        ok: true,
        message: `Strava OK (last ${windowDays}d) — activities: 0 (nothing to fetch by id; getActivity not exercised this run).`,
      };
    }

    // Also smoke the single-activity fetcher (the webhook route's code
    // path) against the first activity in the window — sequential after
    // listActivities, same single-use-refresh-token rationale as
    // smoke-whoop.ts.
    const detail = await deps.getActivity(ctx, activities[0].id);

    return {
      ok: true,
      message:
        `Strava OK (last ${windowDays}d) — activities: ${activities.length}, ` +
        `getActivity(${detail.id}) OK ("${detail.name}").`,
    };
  } catch (err) {
    return { ok: false, message: `Strava API error: ${errorMessage(err)}` };
  }
}

/**
 * The CLI entry point's real wiring. Exported (though only `main()` below
 * calls it at runtime) so tests/unit/smoke-strava.test.ts can structurally
 * pin that the smoke run funnels through the SHARED fetchers/loadTokens —
 * see scripts/smoke-whoop.ts's `productionDeps` doc comment for the full
 * rationale (the "read-only for business data, may rotate tokens" contract
 * only holds while these stay wired to the shared auto-refresh path).
 */
export function productionDeps(): StravaSmokeDeps {
  return {
    admin: getAdminClient(),
    loadTokens,
    listActivities,
    getActivity,
  };
}

async function main(): Promise<void> {
  // Checked here too (runStravaSmoke re-checks internally) specifically so
  // `productionDeps()` — which calls `getAdminClient()`, itself throwing on
  // missing Supabase env — is never invoked before the actionable env
  // message has a chance to print.
  const missing = missingEnvVars(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(envErrorMessage(missing));
    process.exit(1);
    return;
  }

  const result = await runStravaSmoke(productionDeps());
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
