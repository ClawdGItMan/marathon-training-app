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

test("pain log updates area severity", async () => {
  await localRepo.logPain("achilles-l", 3);
  expect((await localRepo.getPains()).find((a) => a.id === "achilles-l")!.severity).toBe(3);
});
