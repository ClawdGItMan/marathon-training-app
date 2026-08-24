import { createClient } from "@supabase/supabase-js";
import { seed } from "@/lib/data/seed";
import { TEST_USER_ID } from "./constants";
import { toChatMessageRow, toPainAreaRow, toPlannedSessionRow, toProposalRow } from "../../scripts/lib/seed-rows";

/**
 * Fast per-test reset for supabase-stack WRITE tests.
 *
 * `supabase db reset` (used once per file in each *.supabase.test.ts's
 * beforeAll) is a full container restart + migration replay — ~25s
 * measured locally. That's fine once per file, but the parity write block
 * and the dedicated decide-proposal suite run many mutating tests that each
 * need the DB back in its seeded state, and 14+ tests * 25s would make the
 * suite take minutes to iterate on.
 *
 * Instead, this restores only the tables a Repo write method can touch
 * (planned_sessions, proposals, pain_areas, chat_messages, plus emptying
 * pain_logs/run_logs) via a service-role client (bypasses RLS — see
 * 0001_schema.sql's "service_role: full access" grants), by deleting and
 * re-inserting rows shaped exactly like scripts/generate-supabase-seed.ts
 * does for supabase/seed.sql. goals/blocks/recovery_snapshots/activities are
 * never mutated by decideProposal/startSession/logPain/logRun/appendChat,
 * so they're intentionally left untouched here — no write path in this task
 * touches them, so there's nothing to restore.
 *
 * Row *shapes* (which seed fields go into which column vs. payload) are
 * shared with scripts/generate-supabase-seed.ts via scripts/lib/seed-rows.ts
 * — the two call sites still encode the wire format differently
 * (supabase-js `.insert()` objects here vs. raw SQL literal text there),
 * but both build the same row objects first, so a shape change in
 * seed-rows.ts can't silently drift between the two.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to already
 * be set in process.env — every caller's beforeAll sets these from
 * `supabase status -o json`, mirroring the existing anon-key pattern in
 * repo-parity-supabase.supabase.test.ts.
 */
export async function resetSupabaseSeed(): Promise<void> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const del = async (table: string) => {
    const { error } = await admin.from(table).delete().eq("user_id", TEST_USER_ID);
    if (error) throw error;
  };

  // Children before parents doesn't matter here (no FK between these), but
  // clear audit-log tables too so appendChat/logRun tests start empty.
  await del("run_logs");
  await del("pain_logs");
  await del("chat_messages");
  await del("proposals");
  await del("planned_sessions");
  await del("pain_areas");

  const { error: sessionsError } = await admin
    .from("planned_sessions")
    .insert(seed.week.map((session) => toPlannedSessionRow(session, TEST_USER_ID)));
  if (sessionsError) throw sessionsError;

  const { error: proposalsError } = await admin
    .from("proposals")
    .insert(seed.proposals.map((proposal) => toProposalRow(proposal, TEST_USER_ID)));
  if (proposalsError) throw proposalsError;

  const { error: painsError } = await admin
    .from("pain_areas")
    .insert(seed.pains.map((pain) => toPainAreaRow(pain, TEST_USER_ID)));
  if (painsError) throw painsError;

  const { error: chatError } = await admin
    .from("chat_messages")
    .insert(seed.coachThread.map((message, index) => toChatMessageRow(message, index, TEST_USER_ID)));
  if (chatError) throw chatError;
}
