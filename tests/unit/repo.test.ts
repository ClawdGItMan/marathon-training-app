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

test("deciding a workout-scope proposal leaves day-scope proposal undecided", async () => {
  const proposals = await localRepo.getOpenProposals();
  const dayP = proposals.find((p) => p.id === "proposal-1")!;
  const workoutP = proposals.find((p) => p.id === "proposal-3")!;
  expect(dayP.scope).toBe("day");
  expect(workoutP.scope).toBe("workout");
  expect(dayP.targetSessionId).toBe("wed-400s");
  expect(workoutP.targetSessionId).toBe("wed-400s");
  // Decide the workout proposal
  await localRepo.decideProposal(workoutP.id, "accepted");
  // day proposal should still be proposed (undecided)
  const remainingProposals = await localRepo.getOpenProposals();
  expect(remainingProposals.find((p) => p.id === "proposal-1")!.status).toBe("proposed");
});

test("dismissing a workout-scope proposal leaves day-scope proposal undecided and session unmutated", async () => {
  const proposals = await localRepo.getOpenProposals();
  const dayP = proposals.find((p) => p.id === "proposal-1")!;
  const workoutP = proposals.find((p) => p.id === "proposal-3")!;
  const sessionBefore = await localRepo.getSession("wed-400s");
  expect(sessionBefore.title).toBe("Rolling 400s");
  expect(sessionBefore.provenance).toBe("original");
  // Dismiss the workout proposal
  await localRepo.decideProposal(workoutP.id, "dismissed");
  // day proposal should still be proposed (undecided)
  const remainingProposals = await localRepo.getOpenProposals();
  expect(remainingProposals.find((p) => p.id === "proposal-1")!.status).toBe("proposed");
  // session should be unchanged
  const sessionAfter = await localRepo.getSession("wed-400s");
  expect(sessionAfter.title).toBe("Rolling 400s");
  expect(sessionAfter.provenance).toBe("original");
});
