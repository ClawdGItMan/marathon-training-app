import { describe, test, expect, beforeEach } from "vitest";
import type { Repo } from "@/lib/data/repo";

/**
 * Shared behavioral suite run against BOTH `localRepo` and `supabaseRepo` so
 * the two implementations of `Repo` stay provably identical in behavior, not
 * just in type signature. Call sites:
 *   - tests/unit/repo-parity-local.test.ts    (localRepo, reset = localStorage.clear())
 *   - tests/unit/repo-parity-supabase.supabase.test.ts (supabaseRepo, reset = db reset)
 *
 * `opts.supportsWrites` gates the write-dependent describe block. Task 3 only
 * implements supabaseRepo's READ methods — every write method throws "not
 * implemented until task 4" — so the supabase runner passes
 * `{ supportsWrites: false }` to skip (not delete) that block; Task 4 flips it
 * back on once decideProposal/startSession/logPain/etc. land there. localRepo
 * already implements writes today (Phase 1), so its runner omits the option
 * (defaults to true) and the block executes immediately — this is what
 * proves the port itself is faithful, independent of any Supabase work.
 */
export function runRepoParitySuite(
  makeRepo: () => Promise<Repo>,
  reset: () => Promise<void>,
  opts: { supportsWrites?: boolean } = {}
): void {
  const supportsWrites = opts.supportsWrites ?? true;
  let repo: Repo;

  beforeEach(async () => {
    await reset();
    repo = await makeRepo();
  });

  // ---------------------------------------------------------------------
  // Reads: always exercised (both runners). Assert against the seeded,
  // pre-decision state — the shape every screen sees on first load.
  // ---------------------------------------------------------------------
  describe("reads (seeded, pre-decision state)", () => {
    test("getGoal returns the seeded race goal", async () => {
      const goal = await repo.getGoal();
      expect(goal.name).toBe("Honolulu Marathon");
      expect(goal.goalSec).toBe(14400);
      expect(goal.predictedSec).toBe(14170);
      expect(goal.daysOut).toBe(165);
      expect(goal.streak).toBe(12);
    });

    test("getBlock returns the seeded training block", async () => {
      const block = await repo.getBlock();
      expect(block.number).toBe(2);
      expect(block.phase).toBe("BUILD");
      expect(block.week).toBe(7);
      expect(block.totalWeeks).toBe(16);
      expect(block.weekMilesDone).toBe(32);
      expect(block.weekMilesTarget).toBe(41);
      expect(block.longRunLabel).toBe("SUN · 12 MI");
    });

    test("getLatestRecovery returns the most recent snapshot", async () => {
      const latest = await repo.getLatestRecovery();
      expect(latest.date).toBe("2026-07-01");
      expect(latest.recoveryPct).toBe(62);
      expect(latest.recoveryDelta).toBe(-9);
      expect(latest.hrv).toBe(48);
      expect(latest.hrvDeltaPct).toBe(-12);
      expect(latest.rhr).toBe(52);
      expect(latest.rhrDelta).toBe(3);
      expect(latest.respRate).toBeCloseTo(14.2);
      expect(latest.load).toBeCloseTo(1.28);
      expect(latest.loadLabel).toBe("elevated");
      expect(latest.sleep.durationMin).toBe(372);
    });

    test("getRecovery7d returns 7 snapshots, latest last", async () => {
      const week = await repo.getRecovery7d();
      expect(week).toHaveLength(7);
      expect(week.at(-1)!.date).toBe("2026-07-01");
    });

    test("getWeekSessions returns all 7 seeded sessions, original provenance", async () => {
      const week = await repo.getWeekSessions();
      expect(week).toHaveLength(7);
      expect(week.map((s) => s.id)).toEqual(
        expect.arrayContaining([
          "mon-easy",
          "tue-intervals",
          "wed-400s",
          "thu-tempo",
          "fri-rest",
          "sat-easy",
          "sun-long",
        ])
      );
      expect(week.every((s) => s.provenance === "original")).toBe(true);
    });

    test("getSession returns the seeded workout detail for wed-400s", async () => {
      const s = await repo.getSession("wed-400s");
      expect(s.title).toBe("Rolling 400s");
      expect(s.type).toBe("speed");
      expect(s.status).toBe("planned");
      expect(s.provenance).toBe("original");
      expect(s.structure?.length).toBeGreaterThan(0);
    });

    test("getOpenProposals returns all 3 seeded proposed proposals", async () => {
      const proposals = await repo.getOpenProposals();
      expect(proposals).toHaveLength(3);
      expect(proposals.map((p) => p.id).sort()).toEqual(["proposal-1", "proposal-2", "proposal-3"]);
    });

    test("getPains returns the seeded pain areas", async () => {
      const pains = await repo.getPains();
      expect(pains).toHaveLength(2);
      const achilles = pains.find((p) => p.id === "achilles-l")!;
      expect(achilles.severity).toBe(2);
      expect(achilles.label).toBe("mild");
      expect(achilles.trend).toBe("improving");
    });

    // seed-derived until Phase 3 on both implementations — not backed by a
    // table yet, so this mostly proves the wiring, not the mapper.
    test("getPredictions returns the 4 seeded distance predictions", async () => {
      const predictions = await repo.getPredictions();
      expect(predictions).toHaveLength(4);
      expect(predictions.map((p) => p.distance)).toEqual(["5K", "10K", "HALF", "FULL"]);
    });

    test("getStrengthSession returns the seeded strength session", async () => {
      const strength = await repo.getStrengthSession();
      expect(strength.phase).toBe("MAX STRENGTH · DELOAD");
      expect(strength.session.length).toBeGreaterThan(0);
    });

    test("getCoachThread returns the seeded coach thread in order", async () => {
      const thread = await repo.getCoachThread();
      expect(thread).toHaveLength(4);
      expect(thread.map((m) => m.id)).toEqual(["msg-0", "msg-1", "msg-2", "msg-3"]);
    });
  });

  // ---------------------------------------------------------------------
  // Writes: proposal accept/modify/dismiss/expiry/provenance, moved-session
  // dual-id, pain logs, session status. Ported from tests/unit/repo.test.ts.
  // Skipped for supabaseRepo until Task 4 implements decideProposal et al —
  // un-skipped in Task 4.
  // ---------------------------------------------------------------------
  const maybeDescribe = supportsWrites ? describe : describe.skip;

  maybeDescribe("writes: proposal decisions, session status, pain log (un-skipped in Task 4)", () => {
    test("accept swaps the session with accepted-proposal provenance", async () => {
      const [p] = await repo.getOpenProposals();
      await repo.decideProposal(p.id, "accepted");
      const s = await repo.getSession(p.targetSessionId);
      expect(s.type).toBe("easy");
      expect(s.provenance).toBe("accepted-proposal");
      expect((await repo.getOpenProposals()).find((x) => x.id === p.id)).toBeUndefined();
    });

    test("dismiss leaves the plan untouched", async () => {
      const [p] = await repo.getOpenProposals();
      await repo.decideProposal(p.id, "dismissed");
      const s = await repo.getSession(p.targetSessionId);
      expect(s.type).toBe("speed");
      expect(s.provenance).toBe("original");
    });

    test("modify applies the edited session", async () => {
      const [p] = await repo.getOpenProposals();
      await repo.decideProposal(p.id, "modified", { ...p.after, title: "EASY · 3 MI", distanceMi: 3 });
      const s = await repo.getSession(p.targetSessionId);
      expect(s.distanceMi).toBe(3);
      expect(s.provenance).toBe("modified-proposal");
    });

    // v2 seed puts two open proposals on wed-400s (day-scope easy swap + workout-scope
    // 600s variant). Deciding the second one must still mutate the plan.
    test("deciding a later proposal that targets the same session applies it", async () => {
      const proposals = await repo.getOpenProposals();
      const workoutP = proposals.find((p) => p.scope === "workout")!;
      expect(workoutP.targetSessionId).toBe("wed-400s");
      await repo.decideProposal(workoutP.id, "accepted");
      const s = await repo.getSession("wed-400s");
      expect(s.title).toBe("Rolling 600s");
      expect(s.provenance).toBe("accepted-proposal");
    });

    test("startSession marks the session in-progress", async () => {
      const before = await repo.getSession("wed-400s");
      expect(before.status).toBe("planned");
      await repo.startSession("wed-400s");
      const after = await repo.getSession("wed-400s");
      expect(after.status).toBe("in-progress");
    });

    test("pain log updates area severity", async () => {
      await repo.logPain("achilles-l", 3);
      expect((await repo.getPains()).find((a) => a.id === "achilles-l")!.severity).toBe(3);
    });

    // F3: proposal-2's accept changes a session id (sun-long -> sat-long-moved).
    // getSession must resolve under both ids, week listings must show the moved
    // session, and status overlay writes keyed to either id must land correctly.
    test("accepting an id-changing proposal: getWeekSessions shows the moved session on SAT", async () => {
      await repo.decideProposal("proposal-2", "accepted");
      const week = await repo.getWeekSessions();
      const moved = week.find((s) => s.id === "sat-long-moved");
      expect(moved).toBeDefined();
      expect(moved!.date).toBe("2026-07-04");
      expect(moved!.title).toBe("Long run");
      expect(moved!.provenance).toBe("accepted-proposal");
    });

    test("accepting an id-changing proposal: getSession resolves under both the old and new id", async () => {
      await repo.decideProposal("proposal-2", "accepted");

      const byOldId = await repo.getSession("sun-long");
      const byNewId = await repo.getSession("sat-long-moved");

      expect(byOldId.id).toBe("sat-long-moved");
      expect(byOldId.date).toBe("2026-07-04");
      expect(byNewId.id).toBe("sat-long-moved");
      expect(byNewId.date).toBe("2026-07-04");
    });

    test("session-status overlay writes keyed to either id land on the resulting session", async () => {
      await repo.decideProposal("proposal-2", "accepted");

      // Written against the NEW id (e.g. Workout Detail reached via the moved row).
      await repo.startSession("sat-long-moved");
      expect((await repo.getSession("sun-long")).status).toBe("in-progress");
      expect((await repo.getSession("sat-long-moved")).status).toBe("in-progress");
    });

    test("session-status overlay writes keyed to the OLD id also land on the resulting session", async () => {
      await repo.decideProposal("proposal-2", "accepted");

      // Written against the OLD id (e.g. a stale link/overlay from before accept).
      await repo.startSession("sun-long");
      expect((await repo.getSession("sun-long")).status).toBe("in-progress");
      expect((await repo.getSession("sat-long-moved")).status).toBe("in-progress");
    });

    // Stacked-proposal spine (F1 regression): wed-400s carries two open proposals
    // (day-scope proposal-1, workout-scope proposal-3). Accepting/modifying one of
    // them must not be a silent no-op if the other was decided first, and must
    // not leave the other sitting there offering a swap against a session that no
    // longer describes reality. The chosen semantics: accepting or modifying a
    // proposal EXPIRES every other still-open ("proposed") proposal targeting the
    // same session. Dismiss never expires competitors — only accept/modify do.
    test("accepting a proposal expires the other open proposal on the same session (original bug repro)", async () => {
      const proposals = await repo.getOpenProposals();
      const dayP = proposals.find((p) => p.id === "proposal-1")!;
      const workoutP = proposals.find((p) => p.id === "proposal-3")!;
      expect(dayP.scope).toBe("day");
      expect(workoutP.scope).toBe("workout");
      expect(dayP.targetSessionId).toBe("wed-400s");
      expect(workoutP.targetSessionId).toBe("wed-400s");

      // Accept proposal-1 first (this is the exact path F1 found broken: a later
      // accept of proposal-3 used to be a silent no-op because resolveSession
      // applied the earliest decided accept in seed order, not decision order).
      await repo.decideProposal(dayP.id, "accepted");

      // proposal-3 must no longer be offered anywhere getOpenProposals feeds.
      const remainingProposals = await repo.getOpenProposals();
      expect(remainingProposals.find((p) => p.id === "proposal-3")).toBeUndefined();
      expect(remainingProposals.find((p) => p.id === "proposal-1")).toBeUndefined();

      // The plan reflects proposal-1's swap, unambiguously.
      const s = await repo.getSession("wed-400s");
      expect(s.type).toBe("easy");
      expect(s.provenance).toBe("accepted-proposal");
    });

    test("accepting the other proposal (reverse order) expires its competitor too", async () => {
      const proposals = await repo.getOpenProposals();
      const dayP = proposals.find((p) => p.id === "proposal-1")!;
      const workoutP = proposals.find((p) => p.id === "proposal-3")!;

      await repo.decideProposal(workoutP.id, "accepted");

      const remainingProposals = await repo.getOpenProposals();
      expect(remainingProposals.find((p) => p.id === "proposal-1")).toBeUndefined();
      expect(remainingProposals.find((p) => p.id === "proposal-3")).toBeUndefined();

      const s = await repo.getSession("wed-400s");
      expect(s.title).toBe("Rolling 600s");
      expect(s.provenance).toBe("accepted-proposal");
    });

    test("dismissing a proposal does NOT expire its competitor, which stays open and undecided", async () => {
      const proposals = await repo.getOpenProposals();
      const dayP = proposals.find((p) => p.id === "proposal-1")!;
      const workoutP = proposals.find((p) => p.id === "proposal-3")!;
      const sessionBefore = await repo.getSession("wed-400s");
      expect(sessionBefore.title).toBe("Rolling 400s");
      expect(sessionBefore.provenance).toBe("original");

      // Dismiss the workout proposal.
      await repo.decideProposal(workoutP.id, "dismissed");

      // Day proposal should still be proposed (open, undecided) — dismiss never
      // cascades an expiry.
      const remainingProposals = await repo.getOpenProposals();
      expect(remainingProposals.find((p) => p.id === dayP.id)!.status).toBe("proposed");

      // Session is unchanged (dismiss never mutates the plan).
      const sessionAfter = await repo.getSession("wed-400s");
      expect(sessionAfter.title).toBe("Rolling 400s");
      expect(sessionAfter.provenance).toBe("original");
    });

    // F2/ledger spine: dismiss proposal-1, THEN accept proposal-3 on the same
    // session. The dismissed proposal-1 must stay dismissed (not reopened, not
    // expired) and proposal-3's accept must still land.
    test("dismiss(p1) then accept(p3) on the same session: p3's swap lands, p1 stays dismissed", async () => {
      const proposals = await repo.getOpenProposals();
      const dayP = proposals.find((p) => p.id === "proposal-1")!;
      const workoutP = proposals.find((p) => p.id === "proposal-3")!;

      await repo.decideProposal(dayP.id, "dismissed");
      await repo.decideProposal(workoutP.id, "accepted");

      const s = await repo.getSession("wed-400s");
      expect(s.title).toBe("Rolling 600s");
      expect(s.provenance).toBe("accepted-proposal");

      // proposal-1 is not offered (it was dismissed, not merely expired-by-cascade)
      // and accepting proposal-3 must not have disturbed that.
      const remainingProposals = await repo.getOpenProposals();
      expect(remainingProposals.find((p) => p.id === "proposal-1")).toBeUndefined();
    });
  });
}
