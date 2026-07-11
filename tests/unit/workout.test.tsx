import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WorkoutDetailScreen } from "@/components/workout/WorkoutDetailScreen";
import { localRepo } from "@/lib/data/local-repo";
import { OfflineError } from "@/lib/data/offline-cache";
import { categoryLabel, groupBreakdown } from "@/lib/workout";
import type { StructureSegment } from "@/lib/domain/types";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const structure: StructureSegment[] = [
  { kind: "warmup", label: "Warm up", zone: "Zone 2", pace: "Easy", duration: "10:00" },
  { kind: "rep", label: "400m hard", zone: "Zone 5", pace: "5K pace", duration: "1:32", repeat: 8 },
  { kind: "recovery", label: "200m float", zone: "easy", pace: "Recovery", duration: "1:05" },
  { kind: "cooldown", label: "Cool down", zone: "Zone 1", pace: "Easy", duration: "10:00" },
];

test("groupBreakdown collapses a rep+recovery pair into one block", () => {
  const blocks = groupBreakdown(structure);
  expect(blocks).toHaveLength(3);
  expect(blocks[0]).toEqual({ kind: "single", segment: structure[0] });
  expect(blocks[1]).toEqual({ kind: "repFloat", rep: structure[1], float: structure[2] });
  expect(blocks[2]).toEqual({ kind: "single", segment: structure[3] });
});

test("categoryLabel maps speed to INTERVALS (design #6a)", () => {
  expect(categoryLabel("speed")).toBe("INTERVALS");
});

test("Workout Detail renders hero, breakdown, coach-suggests box and defaults back target to Plan", async () => {
  render(<WorkoutDetailScreen sessionId="wed-400s" />);

  expect(await screen.findByText("Rolling 400s")).toBeInTheDocument();
  expect(screen.getByText("INTERVALS")).toBeInTheDocument();
  expect(screen.getByText("4.5")).toBeInTheDocument();
  expect(screen.getByText("mi")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument(); // BLOCKS

  expect(screen.getByText("BREAKDOWN")).toBeInTheDocument();
  expect(screen.getByText("Warm up")).toBeInTheDocument();
  expect(screen.getByText("8×")).toBeInTheDocument();
  expect(screen.getByText("400m hard")).toBeInTheDocument();
  expect(screen.getByText("200m float")).toBeInTheDocument();
  expect(screen.getByText("Cool down")).toBeInTheDocument();

  expect(screen.getByText("COACH SUGGESTS")).toBeInTheDocument();
  expect(screen.getByText("Try 5 × 600m instead")).toBeInTheDocument();

  expect(screen.getByRole("button", { name: "START WORKOUT" })).toBeInTheDocument();

  const back = screen.getByLabelText("Back to PLAN");
  expect(back).toHaveAttribute("href", "/plan");
});

test("from=today honors the back target and label", async () => {
  render(<WorkoutDetailScreen sessionId="wed-400s" from="today" />);

  await screen.findByText("Rolling 400s");
  const back = screen.getByLabelText("Back to TODAY");
  expect(back).toHaveAttribute("href", "/today");
});

test("ACCEPT swaps the breakdown to the 5x600m proposal via the repo", async () => {
  render(<WorkoutDetailScreen sessionId="wed-400s" />);

  fireEvent.click(await screen.findByRole("button", { name: "ACCEPT" }));

  await waitFor(() => expect(screen.getByText("Rolling 600s")).toBeInTheDocument());
  expect(screen.getByText("5×")).toBeInTheDocument();
  expect(screen.getByText("600m hard")).toBeInTheDocument();
  expect(screen.queryByText("COACH SUGGESTS")).not.toBeInTheDocument();

  const s = await localRepo.getSession("wed-400s");
  expect(s.provenance).toBe("accepted-proposal");
});

test("KEEP ORIGINAL dismisses the proposal without mutating the plan", async () => {
  render(<WorkoutDetailScreen sessionId="wed-400s" />);

  fireEvent.click(await screen.findByRole("button", { name: "KEEP ORIGINAL" }));

  await waitFor(() => expect(screen.queryByText("COACH SUGGESTS")).not.toBeInTheDocument());
  expect(screen.getByText("Rolling 400s")).toBeInTheDocument();

  const s = await localRepo.getSession("wed-400s");
  expect(s.provenance).toBe("original");
  expect(s.title).toBe("Rolling 400s");
});

test("START WORKOUT marks the session in-progress", async () => {
  render(<WorkoutDetailScreen sessionId="wed-400s" />);

  fireEvent.click(await screen.findByRole("button", { name: "START WORKOUT" }));

  await waitFor(async () => {
    const s = await localRepo.getSession("wed-400s");
    expect(s.status).toBe("in-progress");
  });
});

test("I4: a rejected START WORKOUT shows OFFLINE — TRY AGAIN; retry success clears it", async () => {
  const spy = vi
    .spyOn(localRepo, "startSession")
    .mockRejectedValueOnce(new OfflineError("startSession: write failed"));

  render(<WorkoutDetailScreen sessionId="wed-400s" />);
  fireEvent.click(await screen.findByRole("button", { name: "START WORKOUT" }));

  expect(await screen.findByText("OFFLINE — TRY AGAIN")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "START WORKOUT" }));
  await waitFor(() => expect(screen.queryByText("OFFLINE — TRY AGAIN")).not.toBeInTheDocument());
  const s = await localRepo.getSession("wed-400s");
  expect(s.status).toBe("in-progress");

  spy.mockRestore();
});

test("I4: a rejected decide shows the error line next to COACH SUGGESTS; retry success clears it", async () => {
  const spy = vi
    .spyOn(localRepo, "decideProposal")
    .mockRejectedValueOnce(new Error("boom"));

  render(<WorkoutDetailScreen sessionId="wed-400s" />);
  fireEvent.click(await screen.findByRole("button", { name: "ACCEPT" }));

  expect(await screen.findByText("COULDN'T SAVE — TRY AGAIN")).toBeInTheDocument();
  expect(screen.getByText("COACH SUGGESTS")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ACCEPT" }));
  await waitFor(() => expect(screen.queryByText("COACH SUGGESTS")).not.toBeInTheDocument());
  expect(screen.queryByText("COULDN'T SAVE — TRY AGAIN")).not.toBeInTheDocument();

  spy.mockRestore();
});
