/**
 * Generates supabase/seed.sql from the Phase-1 TypeScript seed object
 * (src/lib/data/seed.ts), so the local Supabase stack and its tests exercise
 * the same demo data as the localStorage repo.
 *
 * Run: npm run db:seed:gen (tsx scripts/generate-supabase-seed.ts)
 *
 * Output is deterministic: no `new Date()` / `Math.random()` calls here.
 * Timestamp columns with a sensible DB default (created_at, synced_at,
 * updated_at, ran_at, logged_at) are simply omitted from the generated
 * INSERT statements so Postgres fills them via `now()` at seed-load time —
 * that keeps the *generated SQL text* byte-identical across runs.
 *
 * Column mapping notes (see task-1-report.md "Seed round-trip notes" for
 * the full reasoning, and task-3-report.md for the payload-columns
 * amendment below):
 *  - Every domain field without a dedicated column is written verbatim into
 *    that table's `payload` jsonb column (planned_sessions, proposals,
 *    pain_areas, activities, chat_messages all have one).
 *  - Task-3 amendment (migration 0002_payload_columns.sql): `goals`,
 *    `blocks`, and `recovery_snapshots` originally had no payload column in
 *    the Task-1 DDL, orphaning goal.predictedSec/daysOut/streak,
 *    block.number/weekMilesDone/weekMilesTarget, and
 *    recovery.recoveryDelta/hrvDeltaPct/rhrDelta/loadLabel. Migration 0002
 *    adds `payload jsonb not null default '{}'` to all three tables and
 *    this generator now writes those fields into it, so the row-mappers in
 *    src/lib/data/row-mappers.ts can read them back.
 *  - `respRate` (recovery) still has no dedicated column and no clean
 *    derivation, so it stays folded into the existing `sleep` jsonb blob
 *    (a judgment call, not a schema change — flagged in the Task-1 report).
 *  - `predictions`, `strength`, `mileage12wk`, `fitness90d`, `todaySessionId`
 *    have no table at all in the Task-1 DDL; the spec marks predictions and
 *    the plan's display content as still-seeded/derived in Phase 2, so
 *    they are skipped entirely here (supabaseRepo reads them from the
 *    static seed module directly — see src/lib/data/supabase-repo.ts).
 *  - `workoutDetail` reuses the same id as its `week[]` entry (wed-400s) —
 *    it is not inserted a second time.
 */

import { seed } from "../src/lib/data/seed";
import { TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_PASSWORD } from "../tests/parity/constants";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- SQL literal helpers --------------------------------------------------

function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableStr(value: string | undefined | null): string {
  return value === undefined || value === null ? "null" : sqlStr(value);
}

function sqlNum(value: number | undefined | null): string {
  return value === undefined || value === null ? "null" : String(value);
}

function sqlBool(value: boolean): string {
  return value ? "true" : "false";
}

function sqlJson(value: unknown): string {
  return `${sqlStr(JSON.stringify(value))}::jsonb`;
}

function insert(table: string, columns: string[], rows: string[][]): string {
  if (rows.length === 0) return "";
  const values = rows.map((row) => `  (${row.join(", ")})`).join(",\n");
  return `insert into ${table} (${columns.join(", ")}) values\n${values};\n`;
}

// ---- Auth user + profile ---------------------------------------------------

const authUserSql = `
-- Seeded auth user (password sign-in, local test stack only).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  ${sqlStr(TEST_USER_ID)},
  'authenticated',
  'authenticated',
  ${sqlStr(TEST_USER_EMAIL)},
  crypt(${sqlStr(TEST_USER_PASSWORD)}, gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  ${sqlStr(TEST_USER_ID)},
  ${sqlStr(TEST_USER_ID)},
  ${sqlJson({ sub: TEST_USER_ID, email: TEST_USER_EMAIL })},
  'email',
  now(),
  now(),
  now()
);
`;

const profileSql = insert(
  "public.profiles",
  ["id", "email", "home_timezone"],
  [[sqlStr(TEST_USER_ID), sqlStr(TEST_USER_EMAIL), sqlStr("America/New_York")]]
);

// ---- goals ------------------------------------------------------------------
// predictedSec/daysOut/streak have no dedicated column -> payload (0002).

const goalsSql = insert(
  "public.goals",
  ["id", "user_id", "name", "date", "target_seconds", "payload"],
  [
    [
      sqlStr("goal-1"),
      sqlStr(TEST_USER_ID),
      sqlStr(seed.goal.name),
      sqlStr(seed.goal.date),
      sqlNum(seed.goal.goalSec),
      sqlJson({
        predictedSec: seed.goal.predictedSec,
        daysOut: seed.goal.daysOut,
        streak: seed.goal.streak,
      }),
    ],
  ]
);

// ---- blocks -------------------------------------------------------------
// number/weekMilesDone/weekMilesTarget have no dedicated column -> payload
// (0002). `label` holds the block's long-run label (the one free-text slot
// the table offers); `periodization` is the seed's top-level 16-week
// bar-chart array, stored per-block since that's where the DDL puts it.

const blocksSql = insert(
  "public.blocks",
  ["id", "user_id", "label", "phase", "week", "total_weeks", "periodization", "payload"],
  [
    [
      sqlStr("block-1"),
      sqlStr(TEST_USER_ID),
      sqlStr(seed.block.longRunLabel),
      sqlStr(seed.block.phase),
      sqlNum(seed.block.week),
      sqlNum(seed.block.totalWeeks),
      sqlJson(seed.periodization),
      sqlJson({
        number: seed.block.number,
        weekMilesDone: seed.block.weekMilesDone,
        weekMilesTarget: seed.block.weekMilesTarget,
      }),
    ],
  ]
);

// ---- planned_sessions -----------------------------------------------------
// distanceMi/paceTarget/zone have no dedicated column -> payload.

const plannedSessionsSql = insert(
  "public.planned_sessions",
  ["id", "user_id", "date", "title", "type", "detail", "structure", "status", "provenance", "payload"],
  seed.week.map((session) => [
    sqlStr(session.id),
    sqlStr(TEST_USER_ID),
    sqlStr(session.date),
    sqlStr(session.title),
    sqlStr(session.type),
    sqlNullableStr(session.detail),
    sqlJson(session.structure ?? []),
    sqlStr(session.status),
    sqlStr(session.provenance),
    sqlJson({
      distanceMi: session.distanceMi,
      paceTarget: session.paceTarget,
      zone: session.zone,
    }),
  ])
);

// ---- proposals --------------------------------------------------------------
// Everything but scope/session_id/status lives in payload verbatim,
// including the full `before`/`after` session objects — this is what
// preserves the moved-session dual-id (sun-long -> sat-long-moved) and the
// per-screen copy fields (headline/subhead/rationale/chatHeadline)
// untouched.

const proposalsSql = insert(
  "public.proposals",
  ["id", "user_id", "scope", "session_id", "status", "payload"],
  seed.proposals.map((proposal) => [
    sqlStr(proposal.id),
    sqlStr(TEST_USER_ID),
    sqlStr(proposal.scope),
    sqlStr(proposal.targetSessionId),
    sqlStr(proposal.status),
    sqlJson({
      headline: proposal.headline,
      subhead: proposal.subhead,
      rationale: proposal.rationale,
      badge: proposal.badge,
      before: proposal.before,
      after: proposal.after,
      drivers: proposal.drivers,
      reviewedAt: proposal.reviewedAt,
      chatHeadline: proposal.chatHeadline,
    }),
  ])
);

// ---- pain_areas ---------------------------------------------------------

const painAreasSql = insert(
  "public.pain_areas",
  ["id", "user_id", "name", "severity", "trend", "payload"],
  seed.pains.map((pain) => [
    sqlStr(pain.id),
    sqlStr(TEST_USER_ID),
    sqlStr(pain.name),
    sqlNum(pain.severity),
    sqlStr(pain.trend),
    sqlJson({ side: pain.side, label: pain.label, trendDays: pain.trendDays }),
  ])
);

// ---- recovery_snapshots -----------------------------------------------------
// recoveryDelta/hrvDeltaPct/rhrDelta/loadLabel have no dedicated column ->
// payload (0002). respRate has no dedicated column or its own payload slot
// on this table, so it stays folded into the `sleep` jsonb blob rather than
// dropped.

const recoverySnapshotsSql = insert(
  "public.recovery_snapshots",
  ["user_id", "day", "recovery_pct", "hrv_ms", "rhr", "day_strain", "sleep", "source", "payload"],
  seed.recovery.map((snapshot) => [
    sqlStr(TEST_USER_ID),
    sqlStr(snapshot.date),
    sqlNum(snapshot.recoveryPct),
    sqlNum(snapshot.hrv),
    sqlNum(snapshot.rhr),
    sqlNum(snapshot.load),
    sqlJson({ ...snapshot.sleep, respRate: snapshot.respRate }),
    sqlStr("whoop"),
    sqlJson({
      recoveryDelta: snapshot.recoveryDelta,
      hrvDeltaPct: snapshot.hrvDeltaPct,
      rhrDelta: snapshot.rhrDelta,
      loadLabel: snapshot.loadLabel,
    }),
  ])
);

// ---- activities ---------------------------------------------------------
// Seed activities predate Strava/Whoop ids; the original string id, title,
// and synced flag have no dedicated column, so they go into payload.

const activitiesSql = insert(
  "public.activities",
  [
    "user_id",
    "sport",
    "started_at",
    "ended_at",
    "distance_m",
    "moving_sec",
    "avg_pace_sec_per_mi",
    "payload",
  ],
  seed.activities.map((activity) => {
    const startedAt = `${activity.date}T00:00:00Z`;
    return [
      sqlStr(TEST_USER_ID),
      sqlStr("run"),
      sqlStr(startedAt),
      `(${sqlStr(startedAt)}::timestamptz + make_interval(secs => ${sqlNum(activity.timeSec)}))`,
      sqlNum(activity.distanceMi * 1609.344),
      sqlNum(activity.timeSec),
      sqlNum(activity.paceSecPerMi),
      sqlJson({ id: activity.id, title: activity.title, synced: activity.synced }),
    ];
  })
);

// ---- chat_messages -----------------------------------------------------

const chatMessagesSql = insert(
  "public.chat_messages",
  ["id", "user_id", "role", "body", "time_label", "proposal_refs", "seq", "payload"],
  seed.coachThread.map((message, index) => [
    sqlStr(message.id),
    sqlStr(TEST_USER_ID),
    sqlStr(message.role),
    sqlStr(message.text),
    sqlNullableStr(message.time),
    message.proposalRefs ? sqlJson(message.proposalRefs) : "null",
    sqlNum(index),
    sqlJson({}),
  ])
);

// ---- assemble ---------------------------------------------------------------

const sections = [
  "-- Generated by scripts/generate-supabase-seed.ts from src/lib/data/seed.ts.",
  "-- Do not hand-edit — re-run `npm run db:seed:gen` instead.",
  authUserSql,
  profileSql,
  goalsSql,
  blocksSql,
  plannedSessionsSql,
  proposalsSql,
  painAreasSql,
  recoverySnapshotsSql,
  activitiesSql,
  chatMessagesSql,
].filter(Boolean);

const output = sections.join("\n");
const outPath = resolve(__dirname, "../supabase/seed.sql");
writeFileSync(outPath, output, "utf8");
// eslint-disable-next-line no-console
console.log(`Wrote ${outPath}`);
