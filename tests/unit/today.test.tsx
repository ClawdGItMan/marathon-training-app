import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TodayScreen } from "@/components/today/TodayScreen";

// Task 12: see body.test.tsx's identical setup comment — default delegates
// to the real (local-mode, no Supabase) getSyncStatus so every existing
// test keeps its byte-identical local-mode rendering; only the dedicated
// Task 12 test below overrides it.
const { getSyncStatusMock } = vi.hoisted(() => ({ getSyncStatusMock: vi.fn() }));
vi.mock("@/lib/sync/staleness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sync/staleness")>("@/lib/sync/staleness");
  getSyncStatusMock.mockImplementation(actual.getSyncStatus);
  return { ...actual, getSyncStatus: getSyncStatusMock };
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("Today composes readiness, recommendation, session, week and predicted lines", async () => {
  render(<TodayScreen />);

  // Readiness hero (#7c pattern): 96px ring + band line + guidance.
  expect(await screen.findByText("62")).toBeInTheDocument();
  expect(screen.getByText("READY")).toBeInTheDocument();
  expect(screen.getByText("MODERATE · ↓9")).toBeInTheDocument();

  // Recommendation corner-tick box with HOLD context and mono drivers line.
  expect(screen.getByText("TODAY'S RECOMMENDATION")).toBeInTheDocument();
  expect(screen.getByText("HOLD")).toBeInTheDocument();
  expect(screen.getByText("Ease off today.")).toBeInTheDocument();
  expect(screen.getByText(/HRV 48 ↓12%/)).toBeInTheDocument();

  // Session rows: open proposal → struck planned row + PROPOSED tag.
  expect(screen.getByText("TODAY'S SESSION")).toBeInTheDocument();
  expect(screen.getByText("Rolling 400s")).toHaveClass("line-through");
  expect(screen.getByText("PROPOSED")).toBeInTheDocument();

  // THIS WEEK + PREDICTED ruled lines.
  expect(screen.getByText("THIS WEEK")).toBeInTheDocument();
  expect(screen.getByText("32 / 41 MI")).toBeInTheDocument();
  expect(screen.getByText("SUN · 12 MI")).toBeInTheDocument();
  expect(screen.getByText("PREDICTED")).toBeInTheDocument();
  expect(screen.getByText("3:56:10")).toBeInTheDocument();
  expect(screen.getByText("−2:12")).toBeInTheDocument();

  // Header: date context + mono SETTINGS link in the right slot.
  expect(screen.getByText("WED · JUL 1")).toBeInTheDocument();
  expect(screen.getByText("SETTINGS").closest("a")).toHaveAttribute("href", "/settings?from=today");

  // Task 12: local mode has no sync concept — the readiness hero's stale
  // marker never renders, so this screen is byte-identical to pre-Task-12
  // local mode.
  expect(screen.queryByText(/STALE —/)).not.toBeInTheDocument();
});

test("Task 12: readiness hero shows the stale marker when whoop hasn't synced within the 3h recovery threshold", async () => {
  const fourHoursAgo = new Date(Date.now() - 4 * 3600e3);
  getSyncStatusMock.mockResolvedValueOnce({
    whoop: { lastOkAt: fourHoursAgo, authBroken: false },
    strava: { lastOkAt: new Date(), authBroken: false },
  });

  render(<TodayScreen />);

  await screen.findByText("READY");
  expect(await screen.findByText("STALE — LAST SYNCED 4H AGO")).toBeInTheDocument();
});

test("ACCEPT mutates today's session to the easy swap", async () => {
  render(<TodayScreen />);

  fireEvent.click(await screen.findByRole("button", { name: "ACCEPT" }));

  // Wait for the decided state to land, then assert the resolved row.
  await waitFor(() => expect(screen.queryByText("PROPOSED")).not.toBeInTheDocument());
  expect(screen.getByText("4 mi · Zone 2 · 9:30/mi")).toBeInTheDocument();
  expect(screen.queryByText("Rolling 400s")).not.toBeInTheDocument();
  // The accepted session is now the single live row with the TODAY marker.
  expect(screen.getByText("TODAY")).toBeInTheDocument();
});

test("MODIFY opens the sheet and saving applies the edit", async () => {
  render(<TodayScreen />);

  fireEvent.click(await screen.findByRole("button", { name: "MODIFY" }));

  const title = await screen.findByLabelText("TITLE");
  fireEvent.change(title, { target: { value: "Easy shakeout" } });
  fireEvent.click(screen.getByRole("button", { name: "SAVE" }));

  expect(await screen.findByText("Easy shakeout")).toBeInTheDocument();
  expect(screen.queryByText("PROPOSED")).not.toBeInTheDocument();
});

test("OVERRIDE keeps the original 400s unstruck", async () => {
  render(<TodayScreen />);

  fireEvent.click(await screen.findByRole("button", { name: "OVERRIDE" }));

  await waitFor(() => expect(screen.queryByText("PROPOSED")).not.toBeInTheDocument());
  expect(screen.getByText("Rolling 400s")).not.toHaveClass("line-through");
});
