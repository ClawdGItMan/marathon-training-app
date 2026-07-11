/**
 * Run-equivalent sport values across both providers (Task 11; extracted
 * into its own module in fix loop 1 — it now gates THREE independent
 * concerns: Whoop/Strava dedupe in dedupe.ts, run-only session matching in
 * strava/sync.ts, and mileage aggregation in supabase-repo.ts — so it no
 * longer belongs to dedupe.ts specifically).
 *
 * Verified against what each sync path actually writes into
 * `activities.sport`:
 *  - Strava `sport_type` (src/lib/integrations/strava/wire.ts,
 *    tests/fixtures/strava/activities.json) — PascalCase.
 *  - Whoop `sport_name` (src/lib/integrations/whoop/sync.ts writes
 *    `w.sport_name` verbatim; tests/fixtures/whoop/workout.json) —
 *    lowercase "running".
 * Deliberately explicit rather than a case-insensitive/fuzzy match: an
 * unrecognized sport value is treated as NOT run-equivalent, never
 * silently merged or matched.
 */
export const RUN_EQUIVALENT_SPORTS: ReadonlySet<string> = new Set([
  "Run",
  "TrailRun",
  "VirtualRun",
  "running",
]);
