/**
 * Re-anchors the demo training plan onto the real calendar (Task 13).
 *
 * The seed's canonical "this week" (src/lib/data/seed.ts's `week` array,
 * `workoutDetail`, and `block.week`) is pinned to a fixed demo date range
 * (2026-06-29 Mon .. 2026-07-05 Sun, block week 7 of 16) so design mocks and
 * fixtures have a stable, hand-authored week to point at. That's fine for a
 * static design reference, but wrong for a deployed app: a visitor opening
 * it on any other real date would see a "today" session dated weeks in the
 * past or future.
 *
 * `reanchorPlan` fixes that by re-dating every planned session (and the
 * proposals that reference them) onto the *current* real week — Monday of
 * `today`'s local week (home tz) — while preserving each session's weekday
 * (the seed's Monday session still lands on a Monday, etc.) and recomputing
 * `block.week` by counting weeks back from race week (`goal.date`, clamped
 * to the block's actual 1..totalWeeks range so it never displays a
 * nonsensical week number for dates far outside the 16-week block).
 *
 * Run: npx tsx scripts/reanchor-plan.ts
 *
 * Writes two files:
 *  - supabase/seed.sql — regenerated (via generate-supabase-seed.ts's
 *    `generateSeedSql`, reused verbatim) from the re-anchored Seed, so a
 *    fresh `supabase db reset` (local stack, e2e) loads a plan anchored to
 *    today rather than the fixed demo week.
 *  - supabase/reanchor-update.sql — UPDATE statements for the already-seeded
 *    cloud DB (planned_sessions.date, blocks.week, proposals.payload for the
 *    seeded demo user). A full delete+reinsert isn't appropriate there —
 *    unlike the local stack, the cloud DB may already have live
 *    proposal decisions / synced activities layered on top of the seed, so
 *    only the date-bearing fields the seed controls are updated in place.
 *    Run it against the deployed project (Supabase SQL editor, or
 *    `psql "$SUPABASE_DB_URL" -f supabase/reanchor-update.sql`) — this
 *    script does not connect to any database itself.
 *
 * Scope note: only `planned_sessions` dates, `block.week`, and proposals'
 * `before`/`after` session dates are re-anchored, matching the task's
 * interface exactly. `goal.daysOut`, `recovery`, `activities`, and
 * `coachThread` timestamps are left as-authored — they read as demo/backfill
 * content rather than "this week's plan" and re-dating them is out of scope
 * here (see task-13-report.md for the full reasoning).
 */

import type { Seed } from "../src/lib/domain/schemas";
import { seed } from "../src/lib/data/seed";
import { localDayOf } from "../src/lib/sync/timezone";
import { TEST_USER_ID } from "../tests/parity/constants";
import { toPlannedSessionRow, toProposalRow } from "./lib/seed-rows";
import { generateSeedSql, resolveSeedUser, sqlJson, sqlNum, sqlStr } from "./generate-supabase-seed";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---- pure calendar-math helpers --------------------------------------------
// Plain YYYY-MM-DD string arithmetic via Date.UTC/getUTCDate/getUTCDay only
// — never a bare `new Date()`/host-local Date method — so this never
// depends on the machine's local timezone (p2-globals "Home timezone" rule).

function parseDateStr(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

function toUtcDate(dateStr: string): Date {
  const { y, m, d } = parseDateStr(dateStr);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO weekday: Monday=1 .. Sunday=7. */
function isoWeekday(dateStr: string): number {
  const jsDay = toUtcDate(dateStr).getUTCDay(); // Sunday=0 .. Saturday=6
  return jsDay === 0 ? 7 : jsDay;
}

function addDays(dateStr: string, days: number): string {
  const date = toUtcDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateStr(date);
}

/** Monday (YYYY-MM-DD) of the ISO week containing dateStr. */
function mondayOfWeek(dateStr: string): string {
  return addDays(dateStr, -(isoWeekday(dateStr) - 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---- reanchorPlan -----------------------------------------------------------

type PlannedSessionLike = Seed["week"][number];

/**
 * Pure, deterministic: `today` is a parameter (never `Date.now()`/bare
 * `new Date()` in here), so the same inputs always produce the same Seed.
 *
 * Week math: race week's Monday is `mondayOfWeek(seed.goal.date)` and is,
 * by definition, `block.totalWeeks` (16 in the current seed). Every prior
 * week counts down from there: `week = totalWeeks - weeksBeforeRaceWeek`,
 * clamped to [1, totalWeeks] so a `today` far outside the 16-week block
 * still yields a displayable block-week number. `weeksBeforeRaceWeek` is
 * exact (both Mondays are 7-day-aligned) — see task-13-report.md for the
 * hand-verified worked examples this formula was checked against.
 *
 * Date placement always follows `today`'s *actual* current week (never the
 * clamped week number) — the clamp only affects the displayed `block.week`
 * label, per the task brief: "the CURRENT real week (today, home tz) maps
 * onto the seed's canonical week".
 */
export function reanchorPlan(seed: Seed, today: Date, tz: string): Seed {
  const todayLocalDay = localDayOf(today, tz);
  const targetMonday = mondayOfWeek(todayLocalDay);
  const raceMonday = mondayOfWeek(seed.goal.date);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysBetween = Math.round(
    (toUtcDate(raceMonday).getTime() - toUtcDate(targetMonday).getTime()) / msPerDay
  );
  const weeksBeforeRaceWeek = daysBetween / 7;
  const totalWeeks = seed.block.totalWeeks;
  const week = clamp(totalWeeks - weeksBeforeRaceWeek, 1, totalWeeks);

  const shiftDate = (dateStr: string): string => addDays(targetMonday, isoWeekday(dateStr) - 1);
  const shiftSession = <T extends PlannedSessionLike>(session: T): T => ({
    ...session,
    date: shiftDate(session.date),
  });

  return {
    ...seed,
    block: { ...seed.block, week },
    week: seed.week.map(shiftSession),
    workoutDetail: shiftSession(seed.workoutDetail),
    proposals: seed.proposals.map((proposal) => ({
      ...proposal,
      before: shiftSession(proposal.before),
      after: shiftSession(proposal.after),
    })),
  };
}

// ---- cloud-DB UPDATE SQL ----------------------------------------------------

/**
 * UPDATE statements (not INSERTs) for the already-seeded cloud DB — reuses
 * the exact same row-shape builders and SQL-literal helpers as
 * generate-supabase-seed.ts/seed.sql (toPlannedSessionRow, toProposalRow,
 * sqlStr/sqlNum/sqlJson) rather than re-deriving column values by hand.
 *
 * `userId` (C1): the cloud DB's seeded user is the REAL owner (seeded via
 * `SEED_USER_ID=<uuid> npm run db:seed:gen` — see that script's header), not
 * the local TEST account, so the emitted UPDATEs must scope to the same
 * uuid. Defaults to the TEST id for the local/demo case and for every
 * pre-existing caller.
 */
export function buildReanchorUpdateSql(reanchored: Seed, userId: string = TEST_USER_ID): string {
  const statements: string[] = [
    "-- Generated by scripts/reanchor-plan.ts.",
    "-- Re-anchors the already-seeded cloud DB's demo plan onto real",
    "-- calendar dates. Run against the deployed Supabase project (SQL",
    '-- editor, or `psql "$SUPABASE_DB_URL" -f supabase/reanchor-update.sql`)',
    "-- — NOT supabase/seed.sql, which only applies on a full `db reset`.",
    "begin;",
    "",
  ];

  for (const session of reanchored.week) {
    const row = toPlannedSessionRow(session, userId);
    statements.push(
      `update public.planned_sessions set date = ${sqlStr(row.date)} where id = ${sqlStr(row.id)} and user_id = ${sqlStr(userId)};`
    );
  }

  statements.push(
    "",
    `update public.blocks set week = ${sqlNum(reanchored.block.week)} where user_id = ${sqlStr(userId)};`,
    ""
  );

  for (const proposal of reanchored.proposals) {
    const row = toProposalRow(proposal, userId);
    statements.push(
      `update public.proposals set payload = ${sqlJson(row.payload)} where id = ${sqlStr(row.id)} and user_id = ${sqlStr(userId)};`
    );
  }

  statements.push("", "commit;");

  return statements.join("\n") + "\n";
}

// ---- CLI entry point --------------------------------------------------------

export interface RunReanchorOptions {
  seed: Seed;
  today: Date;
  tz: string;
  seedSqlPath: string;
  updateSqlPath: string;
  /**
   * User the cloud UPDATE SQL scopes to (C1) — the deployed DB's seeded
   * owner uuid, resolved from SEED_USER_ID by the CLI below. The regenerated
   * seed.sql is NOT affected: it always targets the local TEST account,
   * because it only ever feeds the local stack's `db reset`.
   */
  updateUserId?: string;
}

export interface RunReanchorResult {
  reanchored: Seed;
  seedSql: string;
  updateSql: string;
}

/**
 * Runs the full pipeline and writes both output files. Exported (rather
 * than inlined below) so it can be exercised end-to-end against scratch
 * file paths without touching the real supabase/ files.
 */
export function runReanchor(options: RunReanchorOptions): RunReanchorResult {
  const reanchored = reanchorPlan(options.seed, options.today, options.tz);
  const seedSql = generateSeedSql(reanchored);
  const updateSql = buildReanchorUpdateSql(reanchored, options.updateUserId);

  writeFileSync(options.seedSqlPath, seedSql, "utf8");
  writeFileSync(options.updateSqlPath, updateSql, "utf8");

  return { reanchored, seedSql, updateSql };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  // Matches the seeded demo profile's home_timezone
  // (generate-supabase-seed.ts's profileSql) and p2-globals.md's documented
  // default — not one of the app's env-var-configured values, since this
  // standalone tool has no profiles row of its own to read from.
  const tz = "America/New_York";
  const today = new Date();

  // Same SEED_USER_ID/SEED_USER_EMAIL override as the seed generator (C1):
  // against the deployed DB the seeded owner is a real uuid, so the emitted
  // UPDATEs must scope to it. Unset -> local TEST account, byte-identical
  // pre-C1 output.
  const seedUser = resolveSeedUser();

  const { reanchored } = runReanchor({
    seed,
    today,
    tz,
    seedSqlPath: resolve(__dirname, "../supabase/seed.sql"),
    updateSqlPath: resolve(__dirname, "../supabase/reanchor-update.sql"),
    updateUserId: seedUser.userId,
  });

  const weekOf = mondayOfWeek(localDayOf(today, tz));
  // eslint-disable-next-line no-console
  console.log(
    `Re-anchored plan to week of ${weekOf} (tz=${tz}) — block week ${reanchored.block.week}/${reanchored.block.totalWeeks}.`
  );
  // eslint-disable-next-line no-console
  console.log("Wrote supabase/seed.sql (local stack — run `supabase db reset` to load it).");
  // eslint-disable-next-line no-console
  console.log("Wrote supabase/reanchor-update.sql (run against the cloud DB — see file header).");
}
