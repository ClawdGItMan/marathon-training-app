import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { CoachScreen } from "@/components/coach/CoachScreen";
import { localRepo } from "@/lib/data/local-repo";
import { resolveCoachOrigin } from "@/lib/coach";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("resolveCoachOrigin defaults to /today with no context line when from is absent", () => {
  expect(resolveCoachOrigin(undefined)).toEqual({ backHref: "/today", contextLabel: undefined });
});

test("resolveCoachOrigin maps a recognized from to its tab + context label", () => {
  expect(resolveCoachOrigin("plan")).toEqual({ backHref: "/plan", contextLabel: "PLAN" });
  expect(resolveCoachOrigin("body")).toEqual({ backHref: "/body", contextLabel: "BODY" });
});

test("resolveCoachOrigin falls back to /today for an unrecognized from, with no context line", () => {
  expect(resolveCoachOrigin("bogus")).toEqual({ backHref: "/today", contextLabel: undefined });
});

test("Coach renders header, seeded transcript (#7f copy), and the PROPOSED SWAP box", async () => {
  render(<CoachScreen />);

  expect(await screen.findByText("Coach")).toBeInTheDocument();
  expect(screen.getByText("HAS TODAY'S CONTEXT")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "BACK" })).toHaveAttribute("href", "/today");

  // Morning briefing (F2/F4): proposal-2's only decision surface, since
  // there's no Plan-tab proposal UI in the #7a mock.
  expect(
    screen.getByText(
      "Morning briefing: rain's forecast for Sunday, so here's one open proposal for this week before we get going."
    )
  ).toBeInTheDocument();
  expect(screen.getByText("Move long run to Saturday")).toBeInTheDocument();
  expect(screen.getByText("Rain forecast Sunday — shift the 12 miler.")).toBeInTheDocument();

  expect(
    screen.getByText(
      "Recovery is at 62 — a bit below baseline. Rolling 400s still fit today, just keep the 200m floats truly easy."
    )
  ).toBeInTheDocument();
  expect(screen.getByText("My calves are tight from Monday. Should I still do the 400s?")).toBeInTheDocument();
  expect(screen.getByText("Then let's trade turnover for volume — same stimulus, gentler on the calves:")).toBeInTheDocument();
  expect(screen.getByText("YOU")).toBeInTheDocument();
  expect(screen.getAllByText(/COACH/).length).toBeGreaterThan(0);

  // Both open proposals (proposal-2 week-scope, proposal-3 workout-scope)
  // render a decidable PROPOSED SWAP box.
  expect(screen.getAllByText("PROPOSED SWAP")).toHaveLength(2);
  expect(screen.getByText("5 × 600m at 10K pace")).toBeInTheDocument();
  expect(screen.getByText("Same time in Zone 5, fewer hard accelerations.")).toBeInTheDocument();
  expect(screen.getByText("~44 MIN")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "ACCEPT" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "KEEP ORIGINAL" })).toHaveLength(2);
});

test("quick-prompt chips and the composer render per #7f", async () => {
  render(<CoachScreen />);
  await screen.findByText("Coach");

  expect(screen.getByRole("button", { name: "WHY THIS WORKOUT?" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "I'M SORE" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "MOVE MY LONG RUN" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("ASK ANYTHING…")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
});

test("ACCEPT swaps the workout proposal via the shared repo API and removes only its box", async () => {
  render(<CoachScreen />);
  const acceptButtons = await screen.findAllByRole("button", { name: "ACCEPT" });
  // msg-0 (proposal-2) renders first in the transcript, msg-3 (proposal-3) second.
  fireEvent.click(acceptButtons[1]);

  await waitFor(() => expect(screen.getAllByText("PROPOSED SWAP")).toHaveLength(1));
  // proposal-2's briefing box is still open/undecided.
  expect(screen.getByText("Move long run to Saturday")).toBeInTheDocument();

  const s = await localRepo.getSession("wed-400s");
  expect(s.title).toBe("Rolling 600s");
  expect(s.provenance).toBe("accepted-proposal");
});

test("KEEP ORIGINAL dismisses the workout proposal without mutating the plan", async () => {
  render(<CoachScreen />);
  const keepButtons = await screen.findAllByRole("button", { name: "KEEP ORIGINAL" });
  fireEvent.click(keepButtons[1]);

  await waitFor(() => expect(screen.getAllByText("PROPOSED SWAP")).toHaveLength(1));
  expect(screen.getByText("Move long run to Saturday")).toBeInTheDocument();

  const s = await localRepo.getSession("wed-400s");
  expect(s.title).toBe("Rolling 400s");
  expect(s.provenance).toBe("original");
});

test("ACCEPT on the weekly briefing proposal swaps the moved session and removes only its box", async () => {
  render(<CoachScreen />);
  const acceptButtons = await screen.findAllByRole("button", { name: "ACCEPT" });
  fireEvent.click(acceptButtons[0]);

  await waitFor(() => expect(screen.getAllByText("PROPOSED SWAP")).toHaveLength(1));
  // proposal-3's box is still open/undecided.
  expect(screen.getByText("5 × 600m at 10K pace")).toBeInTheDocument();

  const s = await localRepo.getSession("sun-long");
  expect(s.id).toBe("sat-long-moved");
  expect(s.provenance).toBe("accepted-proposal");
});

test("an already-decided proposal (decided elsewhere) does not show its box, but the other open proposal still renders", async () => {
  await localRepo.decideProposal("proposal-3", "dismissed");
  render(<CoachScreen />);
  await screen.findByText("Coach");
  expect(screen.queryByText("5 × 600m at 10K pace")).not.toBeInTheDocument();
  expect(screen.getAllByText("PROPOSED SWAP")).toHaveLength(1);
  expect(screen.getByText("Move long run to Saturday")).toBeInTheDocument();
});

test("typing and sending appends a user message + fixed offline reply, persisted via the repo", async () => {
  render(<CoachScreen />);
  await screen.findByText("Coach");

  fireEvent.change(screen.getByPlaceholderText("ASK ANYTHING…"), {
    target: { value: "Can I move tomorrow's run?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(await screen.findByText("Can I move tomorrow's run?")).toBeInTheDocument();
  expect(await screen.findByText("Noted — I'll factor that into your next few sessions.")).toBeInTheDocument();

  const thread = await localRepo.getCoachThread();
  expect(thread.at(-2)?.text).toBe("Can I move tomorrow's run?");
  expect(thread.at(-2)?.role).toBe("user");
  expect(thread.at(-1)?.role).toBe("coach");
  expect(thread.at(-1)?.text).toBe("Noted — I'll factor that into your next few sessions.");
});

test("clicking a quick-prompt chip sends it as a user message and gets the fixed reply", async () => {
  render(<CoachScreen />);
  await screen.findByText("Coach");

  fireEvent.click(screen.getByRole("button", { name: "I'M SORE" }));

  const thread = await waitFor(async () => {
    const t = await localRepo.getCoachThread();
    expect(t.at(-2)?.text).toBe("I'M SORE");
    return t;
  });
  expect(thread.at(-2)?.role).toBe("user");
  expect(thread.at(-1)?.text).toBe("Noted — I'll factor that into your next few sessions.");
});

test("from=plan renders the BACK target and a CONTEXT line seeded from the origin tab", async () => {
  render(<CoachScreen from="plan" />);
  await screen.findByText("Coach");

  expect(screen.getByRole("link", { name: "BACK" })).toHaveAttribute("href", "/plan");
  expect(screen.getByText(/CONTEXT: PLAN · WK 07\/16/)).toBeInTheDocument();
});

test("no from param renders no CONTEXT line", async () => {
  render(<CoachScreen />);
  await screen.findByText("Coach");

  expect(screen.queryByText(/CONTEXT:/)).not.toBeInTheDocument();
});
