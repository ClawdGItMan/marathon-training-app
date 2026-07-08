import { beforeEach, expect, test } from "vitest";
import { localRepo } from "@/lib/data/local-repo";

beforeEach(() => localStorage.clear());

test("accept swaps the session with accepted-proposal provenance", async () => {
  const [p] = await localRepo.getOpenProposals();
  await localRepo.decideProposal(p.id, "accepted");
  const s = await localRepo.getSession(p.targetSessionId);
  expect(s.type).toBe("easy");
  expect(s.provenance).toBe("accepted-proposal");
  expect((await localRepo.getOpenProposals()).find((x) => x.id === p.id)).toBeUndefined();
});

test("dismiss leaves the plan untouched", async () => {
  const [p] = await localRepo.getOpenProposals();
  await localRepo.decideProposal(p.id, "dismissed");
  const s = await localRepo.getSession(p.targetSessionId);
  expect(s.type).toBe("speed");
  expect(s.provenance).toBe("original");
});

test("modify applies the edited session", async () => {
  const [p] = await localRepo.getOpenProposals();
  await localRepo.decideProposal(p.id, "modified", { ...p.after, title: "EASY · 3 MI", distanceMi: 3 });
  const s = await localRepo.getSession(p.targetSessionId);
  expect(s.distanceMi).toBe(3);
  expect(s.provenance).toBe("modified-proposal");
});

// v2 seed puts two open proposals on wed-400s (day-scope easy swap + workout-scope
// 600s variant). Deciding the second one must still mutate the plan.
test("deciding a later proposal that targets the same session applies it", async () => {
  const proposals = await localRepo.getOpenProposals();
  const workoutP = proposals.find((p) => p.scope === "workout")!;
  expect(workoutP.targetSessionId).toBe("wed-400s");
  await localRepo.decideProposal(workoutP.id, "accepted");
  const s = await localRepo.getSession("wed-400s");
  expect(s.title).toBe("Rolling 600s");
  expect(s.provenance).toBe("accepted-proposal");
});

test("startSession marks the session in-progress", async () => {
  const before = await localRepo.getSession("wed-400s");
  expect(before.status).toBe("planned");
  await localRepo.startSession("wed-400s");
  const after = await localRepo.getSession("wed-400s");
  expect(after.status).toBe("in-progress");
});

test("pain log updates area severity", async () => {
  await localRepo.logPain("achilles-l", 3);
  expect((await localRepo.getPains()).find((a) => a.id === "achilles-l")!.severity).toBe(3);
});

// F3: proposal-2's accept changes a session id (sun-long -> sat-long-moved).
// getSession must resolve under both ids, week listings must show the moved
// session, and status overlay writes keyed to either id must land correctly.
test("accepting an id-changing proposal: getWeekSessions shows the moved session on SAT", async () => {
  await localRepo.decideProposal("proposal-2", "accepted");
  const week = await localRepo.getWeekSessions();
  const moved = week.find((s) => s.id === "sat-long-moved");
  expect(moved).toBeDefined();
  expect(moved!.date).toBe("2026-07-04");
  expect(moved!.title).toBe("Long run");
  expect(moved!.provenance).toBe("accepted-proposal");
});

test("accepting an id-changing proposal: getSession resolves under both the old and new id", async () => {
  await localRepo.decideProposal("proposal-2", "accepted");

  const byOldId = await localRepo.getSession("sun-long");
  const byNewId = await localRepo.getSession("sat-long-moved");

  expect(byOldId.id).toBe("sat-long-moved");
  expect(byOldId.date).toBe("2026-07-04");
  expect(byNewId.id).toBe("sat-long-moved");
  expect(byNewId.date).toBe("2026-07-04");
});

test("session-status overlay writes keyed to either id land on the resulting session", async () => {
  await localRepo.decideProposal("proposal-2", "accepted");

  // Written against the NEW id (e.g. Workout Detail reached via the moved row).
  await localRepo.startSession("sat-long-moved");
  expect((await localRepo.getSession("sun-long")).status).toBe("in-progress");
  expect((await localRepo.getSession("sat-long-moved")).status).toBe("in-progress");
});

test("session-status overlay writes keyed to the OLD id also land on the resulting session", async () => {
  await localRepo.decideProposal("proposal-2", "accepted");

  // Written against the OLD id (e.g. a stale link/overlay from before accept).
  await localRepo.startSession("sun-long");
  expect((await localRepo.getSession("sun-long")).status).toBe("in-progress");
  expect((await localRepo.getSession("sat-long-moved")).status).toBe("in-progress");
});

// Stacked-proposal spine (F1 regression): wed-400s carries two open proposals
// (day-scope proposal-1, workout-scope proposal-3). Accepting/modifying one of
// them must not be a silent no-op if the other was decided first, and must
// not leave the other sitting there offering a swap against a session that no
// longer describes reality. The chosen semantics: accepting or modifying a
// proposal EXPIRES every other still-open ("proposed") proposal targeting the
// same session. Dismiss never expires competitors — only accept/modify do.

test("accepting a proposal expires the other open proposal on the same session (original bug repro)", async () => {
  const proposals = await localRepo.getOpenProposals();
  const dayP = proposals.find((p) => p.id === "proposal-1")!;
  const workoutP = proposals.find((p) => p.id === "proposal-3")!;
  expect(dayP.scope).toBe("day");
  expect(workoutP.scope).toBe("workout");
  expect(dayP.targetSessionId).toBe("wed-400s");
  expect(workoutP.targetSessionId).toBe("wed-400s");

  // Accept proposal-1 first (this is the exact path F1 found broken: a later
  // accept of proposal-3 used to be a silent no-op because resolveSession
  // applied the earliest decided accept in seed order, not decision order).
  await localRepo.decideProposal(dayP.id, "accepted");

  // proposal-3 must no longer be offered anywhere getOpenProposals feeds.
  const remainingProposals = await localRepo.getOpenProposals();
  expect(remainingProposals.find((p) => p.id === "proposal-3")).toBeUndefined();
  expect(remainingProposals.find((p) => p.id === "proposal-1")).toBeUndefined();

  // The plan reflects proposal-1's swap, unambiguously.
  const s = await localRepo.getSession("wed-400s");
  expect(s.type).toBe("easy");
  expect(s.provenance).toBe("accepted-proposal");
});

test("accepting the other proposal (reverse order) expires its competitor too", async () => {
  const proposals = await localRepo.getOpenProposals();
  const dayP = proposals.find((p) => p.id === "proposal-1")!;
  const workoutP = proposals.find((p) => p.id === "proposal-3")!;

  await localRepo.decideProposal(workoutP.id, "accepted");

  const remainingProposals = await localRepo.getOpenProposals();
  expect(remainingProposals.find((p) => p.id === "proposal-1")).toBeUndefined();
  expect(remainingProposals.find((p) => p.id === "proposal-3")).toBeUndefined();

  const s = await localRepo.getSession("wed-400s");
  expect(s.title).toBe("Rolling 600s");
  expect(s.provenance).toBe("accepted-proposal");
});

test("dismissing a proposal does NOT expire its competitor, which stays open and undecided", async () => {
  const proposals = await localRepo.getOpenProposals();
  const dayP = proposals.find((p) => p.id === "proposal-1")!;
  const workoutP = proposals.find((p) => p.id === "proposal-3")!;
  const sessionBefore = await localRepo.getSession("wed-400s");
  expect(sessionBefore.title).toBe("Rolling 400s");
  expect(sessionBefore.provenance).toBe("original");

  // Dismiss the workout proposal.
  await localRepo.decideProposal(workoutP.id, "dismissed");

  // Day proposal should still be proposed (open, undecided) — dismiss never
  // cascades an expiry.
  const remainingProposals = await localRepo.getOpenProposals();
  expect(remainingProposals.find((p) => p.id === dayP.id)!.status).toBe("proposed");

  // Session is unchanged (dismiss never mutates the plan).
  const sessionAfter = await localRepo.getSession("wed-400s");
  expect(sessionAfter.title).toBe("Rolling 400s");
  expect(sessionAfter.provenance).toBe("original");
});

// F2/ledger spine: dismiss proposal-1, THEN accept proposal-3 on the same
// session. The dismissed proposal-1 must stay dismissed (not reopened, not
// expired) and proposal-3's accept must still land.
test("dismiss(p1) then accept(p3) on the same session: p3's swap lands, p1 stays dismissed", async () => {
  const proposals = await localRepo.getOpenProposals();
  const dayP = proposals.find((p) => p.id === "proposal-1")!;
  const workoutP = proposals.find((p) => p.id === "proposal-3")!;

  await localRepo.decideProposal(dayP.id, "dismissed");
  await localRepo.decideProposal(workoutP.id, "accepted");

  const s = await localRepo.getSession("wed-400s");
  expect(s.title).toBe("Rolling 600s");
  expect(s.provenance).toBe("accepted-proposal");

  // proposal-1 is not offered (it was dismissed, not merely expired-by-cascade)
  // and accepting proposal-3 must not have disturbed that.
  const remainingProposals = await localRepo.getOpenProposals();
  expect(remainingProposals.find((p) => p.id === "proposal-1")).toBeUndefined();
});
