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
 *
 * `generateSeedSql` below is a pure function of a `Seed` object (no I/O) so
 * scripts/reanchor-plan.ts (Task 13) can reuse this exact INSERT-building
 * logic to regenerate supabase/seed.sql from a re-anchored Seed, instead of
 * forking it. Only the bottom of this file (guarded so it runs solely when
 * this script is executed directly, not when `generateSeedSql`/the `sql*`
 * helpers are imported elsewhere) performs the actual file write.
 */

import { z } from "zod";
import type { Seed } from "../src/lib/domain/schemas";
import { seed } from "../src/lib/data/seed";
import { TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_PASSWORD } from "../tests/parity/constants";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toChatMessageRow, toPainAreaRow, toPlannedSessionRow, toProposalRow } from "./lib/seed-rows";

// ---- seed user resolution (C1: real-user bootstrap) -------------------------
// The deployed app's bootstrap problem: a first OTP sign-in creates ONLY an
// auth.users row — nothing creates a profiles row (profiles INSERT is
// service-role-only as of migration 0004), so a real user would otherwise
// see a blank app and a 502'ing OAuth callback (integration_tokens FK ->
// profiles). The fix is to run THIS generator against the cloud DB with the
// real user's auth uuid: SEED_USER_ID + SEED_USER_EMAIL env overrides seed
// `profiles` + every data row against that uuid and SKIP the auth.users
// insert (the real auth user already exists — created by their first OTP
// sign-in). Env unset (local stack, every test) keeps the existing TEST
// constants and stays byte-identical to the pre-parameterization output.

export type SeedUser = {
  userId: string;
  userEmail: string;
  /** true = local test stack: also insert the password-auth auth.users/auth.identities rows. */
  createAuthUser: boolean;
};

export const DEFAULT_SEED_USER: SeedUser = {
  userId: TEST_USER_ID,
  userEmail: TEST_USER_EMAIL,
  createAuthUser: true,
};

const cloudSeedEnvSchema = z.object({
  SEED_USER_ID: z.string().uuid("SEED_USER_ID must be the auth user's uuid"),
  SEED_USER_EMAIL: z
    .string({
      error:
        "SEED_USER_EMAIL is required whenever SEED_USER_ID is set — never silently seed the local test email into a cloud profile.",
    })
    .email(),
});

/**
 * Resolves which user the seed targets from env (Zod-validated at the
 * boundary). `SEED_USER_ID` unset -> the local test-stack default.
 */
export function resolveSeedUser(env: Record<string, string | undefined> = process.env): SeedUser {
  if (!env.SEED_USER_ID) return DEFAULT_SEED_USER;
  const parsed = cloudSeedEnvSchema.parse({
    SEED_USER_ID: env.SEED_USER_ID,
    SEED_USER_EMAIL: env.SEED_USER_EMAIL,
  });
  return { userId: parsed.SEED_USER_ID, userEmail: parsed.SEED_USER_EMAIL, createAuthUser: false };
}

// ---- SQL literal helpers --------------------------------------------------
// Exported so scripts/reanchor-plan.ts (Task 13) can build its cloud-DB
// UPDATE statements with the exact same literal-escaping/JSON-encoding
// rules as the INSERTs below, instead of re-implementing them.

export function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlNullableStr(value: string | undefined | null): string {
  return value === undefined || value === null ? "null" : sqlStr(value);
}

export function sqlNum(value: number | undefined | null): string {
  return value === undefined || value === null ? "null" : String(value);
}

function sqlBool(value: boolean): string {
  return value ? "true" : "false";
}

export function sqlJson(value: unknown): string {
  return `${sqlStr(JSON.stringify(value))}::jsonb`;
}

function insert(table: string, columns: string[], rows: string[][]): string {
  if (rows.length === 0) return "";
  const values = rows.map((row) => `  (${row.join(", ")})`).join(",\n");
  return `insert into ${table} (${columns.join(", ")}) values\n${values};\n`;
}

/**
 * Builds the full seed.sql text for a given Seed object. Pure — no I/O —
 * so it can be called with either the canonical demo `seed` (this file's
 * own CLI entry point below) or a re-anchored Seed (scripts/reanchor-plan.ts).
 *
 * `user` defaults to the local test-stack account; pass `resolveSeedUser()`'s
 * cloud override to seed a real user's profile + data instead (in which case
 * the auth.users/auth.identities inserts are skipped entirely — see the
 * "seed user resolution" comment above).
 */
export function generateSeedSql(seed: Seed, user: SeedUser = DEFAULT_SEED_USER): string {
  const userId = user.userId;

  // ---- Auth user + profile ---------------------------------------------------

  const authUserSql = `
-- Seeded auth user (password sign-in, local test stack only).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  ${sqlStr(userId)},
  'authenticated',
  'authenticated',
  ${sqlStr(user.userEmail)},
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
  ${sqlStr(userId)},
  ${sqlStr(userId)},
  ${sqlJson({ sub: userId, email: user.userEmail })},
  'email',
  now(),
  now(),
  now()
);
`;

  const profileSql = insert(
    "public.profiles",
    ["id", "email", "home_timezone"],
    [[sqlStr(userId), sqlStr(user.userEmail), sqlStr("America/New_York")]]
  );

  // ---- goals ------------------------------------------------------------------
  // predictedSec/daysOut/streak have no dedicated column -> payload (0002).

  const goalsSql = insert(
    "public.goals",
    ["id", "user_id", "name", "date", "target_seconds", "payload"],
    [
      [
        sqlStr("goal-1"),
        sqlStr(userId),
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
        sqlStr(userId),
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
    seed.week.map((session) => {
      const row = toPlannedSessionRow(session, userId);
      return [
        sqlStr(row.id),
        sqlStr(row.user_id),
        sqlStr(row.date),
        sqlStr(row.title),
        sqlStr(row.type),
        sqlNullableStr(row.detail),
        sqlJson(row.structure),
        sqlStr(row.status),
        sqlStr(row.provenance),
        sqlJson(row.payload),
      ];
    })
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
    seed.proposals.map((proposal) => {
      const row = toProposalRow(proposal, userId);
      return [
        sqlStr(row.id),
        sqlStr(row.user_id),
        sqlStr(row.scope),
        sqlStr(row.session_id),
        sqlStr(row.status),
        sqlJson(row.payload),
      ];
    })
  );

  // ---- pain_areas ---------------------------------------------------------

  const painAreasSql = insert(
    "public.pain_areas",
    ["id", "user_id", "name", "severity", "trend", "payload"],
    seed.pains.map((pain) => {
      const row = toPainAreaRow(pain, userId);
      return [
        sqlStr(row.id),
        sqlStr(row.user_id),
        sqlStr(row.name),
        sqlNum(row.severity),
        sqlStr(row.trend),
        sqlJson(row.payload),
      ];
    })
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
      sqlStr(userId),
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
        sqlStr(userId),
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
    seed.coachThread.map((message, index) => {
      const row = toChatMessageRow(message, index, userId);
      return [
        sqlStr(row.id),
        sqlStr(row.user_id),
        sqlStr(row.role),
        sqlStr(row.body),
        sqlNullableStr(row.time_label),
        row.proposal_refs ? sqlJson(row.proposal_refs) : "null",
        sqlNum(row.seq),
        sqlJson(row.payload),
      ];
    })
  );

  // ---- assemble ---------------------------------------------------------------

  const sections = [
    "-- Generated by scripts/generate-supabase-seed.ts from src/lib/data/seed.ts.",
    "-- Do not hand-edit — re-run `npm run db:seed:gen` instead.",
    // Cloud mode (SEED_USER_ID set): the real auth.users row already exists
    // (created by the owner's first OTP sign-in) — only data rows are seeded.
    user.createAuthUser ? authUserSql : "",
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

  return sections.join("\n");
}

// ---- CLI entry point --------------------------------------------------------
// Guarded so importing `generateSeedSql`/the `sql*` helpers (as
// scripts/reanchor-plan.ts and tests/unit/reanchor.test.ts do) never
// triggers a disk write as a side effect of module load — only running this
// file directly (`npm run db:seed:gen` / `tsx scripts/generate-supabase-seed.ts`)
// does.

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
  const user = resolveSeedUser();
  const output = generateSeedSql(seed, user);
  // Cloud mode writes to a SEPARATE file: overwriting supabase/seed.sql with
  // a real user's uuid/email would break the local stack (its auth user is
  // the TEST account) and every stack-backed test on the next `db reset`.
  const outPath = user.createAuthUser
    ? resolve(__dirname, "../supabase/seed.sql")
    : resolve(__dirname, "../supabase/seed.cloud.sql");
  writeFileSync(outPath, output, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath}`);
  if (!user.createAuthUser) {
    // eslint-disable-next-line no-console
    console.log(
      `Cloud seed for ${user.userEmail} (${user.userId}) — run it against the deployed DB:\n` +
        `  psql "$SUPABASE_DB_URL" -f supabase/seed.cloud.sql\n` +
        "(or paste into the Supabase SQL editor). Not for the local stack; not committed."
    );
  }
}
