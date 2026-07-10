import { createClient } from "@supabase/supabase-js";
import { seed } from "@/lib/data/seed";
import { TEST_USER_ID } from "./constants";

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
 * NOTE: this duplicates row-shape knowledge already encoded in
 * scripts/generate-supabase-seed.ts (JS objects here vs. generated SQL
 * text there) rather than sharing a single builder — pragmatic given the
 * two call sites need different wire formats (supabase-js `.insert()` rows
 * vs. raw SQL literals). If `seed.ts`'s shape changes, keep both in sync.
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

  const { error: sessionsError } = await admin.from("planned_sessions").insert(
    seed.week.map((session) => ({
      id: session.id,
      user_id: TEST_USER_ID,
      date: session.date,
      title: session.title,
      type: session.type,
      detail: session.detail ?? null,
      structure: session.structure ?? [],
      status: session.status,
      provenance: session.provenance,
      payload: {
        distanceMi: session.distanceMi,
        paceTarget: session.paceTarget,
        zone: session.zone,
      },
    }))
  );
  if (sessionsError) throw sessionsError;

  const { error: proposalsError } = await admin.from("proposals").insert(
    seed.proposals.map((proposal) => ({
      id: proposal.id,
      user_id: TEST_USER_ID,
      scope: proposal.scope,
      session_id: proposal.targetSessionId,
      status: proposal.status,
      payload: {
        headline: proposal.headline,
        subhead: proposal.subhead,
        rationale: proposal.rationale,
        badge: proposal.badge,
        before: proposal.before,
        after: proposal.after,
        drivers: proposal.drivers,
        reviewedAt: proposal.reviewedAt,
        chatHeadline: proposal.chatHeadline,
      },
    }))
  );
  if (proposalsError) throw proposalsError;

  const { error: painsError } = await admin.from("pain_areas").insert(
    seed.pains.map((pain) => ({
      id: pain.id,
      user_id: TEST_USER_ID,
      name: pain.name,
      severity: pain.severity,
      trend: pain.trend,
      payload: { side: pain.side, label: pain.label, trendDays: pain.trendDays },
    }))
  );
  if (painsError) throw painsError;

  const { error: chatError } = await admin.from("chat_messages").insert(
    seed.coachThread.map((message, index) => ({
      id: message.id,
      user_id: TEST_USER_ID,
      role: message.role,
      body: message.text,
      time_label: message.time ?? null,
      proposal_refs: message.proposalRefs ?? null,
      seq: index,
      payload: {},
    }))
  );
  if (chatError) throw chatError;
}
