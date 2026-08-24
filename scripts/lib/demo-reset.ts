import type { SupabaseClient } from "@supabase/supabase-js";
import { seed } from "../../src/lib/data/seed";
import {
  toActivityRow,
  toBlockRow,
  toChatMessageRow,
  toGoalRow,
  toPainAreaRow,
  toPlannedSessionRow,
  toProposalRow,
  toRecoverySnapshotRow,
} from "./seed-rows";

/**
 * Demo-account provisioning + reset (spec:
 * docs/superpowers/specs/2026-08-24-public-demo-access-design.md).
 *
 * Service-role only — callers hold an admin client. Node-side only
 * (scripts + stack tests), same placement rationale as seed-rows.ts.
 */

/**
 * Find-or-create the demo auth user and sync its password to the env value
 * (so rotating DEMO_USER_PASSWORD is just: change env, re-run demo:reset).
 * Returns the auth uuid.
 */
export async function ensureDemoUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const target = email.trim().toLowerCase();
  // Single-tenant + demo: user count is tiny, one page is plenty.
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw new Error(`ensureDemoUser: listUsers failed: ${listError.message}`);

  const existing = listed.users.find((u) => (u.email ?? "").toLowerCase() === target);
  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (updateError) {
      throw new Error(`ensureDemoUser: password sync failed: ${updateError.message}`);
    }
    return existing.id;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: target,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`ensureDemoUser: createUser failed: ${createError?.message ?? "no user"}`);
  }
  return created.user.id;
}

/**
 * Wipe-and-reseed the demo account's data. Every business table FKs to
 * profiles(id) ON DELETE CASCADE (0001_schema.sql), so deleting the one
 * profiles row clears ALL demo rows — including any table a hostile
 * visitor wrote to directly via PostgREST — in one statement, no FK-order
 * bookkeeping to go stale when a table is added.
 */
export async function resetDemoData(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  const { error: wipeError } = await admin.from("profiles").delete().eq("id", userId);
  if (wipeError) throw new Error(`resetDemoData: profile wipe failed: ${wipeError.message}`);

  // goals.id and blocks.id are GLOBAL text primary keys (0001_schema.sql —
  // unlike planned_sessions/proposals/pain_areas/chat_messages, which key on
  // (user_id, id)). toGoalRow/toBlockRow hardcode "goal-1"/"block-1" because
  // seed-rows.ts's only other call site (generate-supabase-seed.ts) ever
  // seeds a single profile. The demo account is a SECOND profile in the
  // same database as the owner (also seeded with "goal-1"/"block-1" —
  // supabase/seed.sql), so inserting those ids verbatim collides with the
  // owner's rows. Neither id has FK dependents elsewhere and the app never
  // filters by it (supabase-repo.ts does `.from("goals").select("*").single()`,
  // relying on RLS + one-row-per-user), so re-keying per userId here is
  // safe and keeps seed-rows.ts's single-profile contract untouched.
  const inserts: Array<[string, unknown[]]> = [
    ["profiles", [{ id: userId, email, home_timezone: "America/New_York" }]],
    ["goals", [{ ...toGoalRow(seed.goal, userId), id: `${userId}-goal-1` }]],
    ["blocks", [{ ...toBlockRow(seed.block, seed.periodization, userId), id: `${userId}-block-1` }]],
    ["planned_sessions", seed.week.map((s) => toPlannedSessionRow(s, userId))],
    ["proposals", seed.proposals.map((p) => toProposalRow(p, userId))],
    ["pain_areas", seed.pains.map((p) => toPainAreaRow(p, userId))],
    ["recovery_snapshots", seed.recovery.map((r) => toRecoverySnapshotRow(r, userId))],
    ["activities", seed.activities.map((a) => toActivityRow(a, userId))],
    ["chat_messages", seed.coachThread.map((m, i) => toChatMessageRow(m, i, userId))],
  ];

  for (const [table, rows] of inserts) {
    const { error } = await admin.from(table).insert(rows);
    if (error) throw new Error(`resetDemoData: ${table} insert failed: ${error.message}`);
  }
}
