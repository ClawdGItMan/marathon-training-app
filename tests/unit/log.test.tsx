import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LogScreen } from "@/components/log/LogScreen";
import { localRepo } from "@/lib/data/local-repo";
import { OfflineError } from "@/lib/data/offline-cache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

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

beforeEach(() => {
  localStorage.clear();
  push.mockClear();
});
afterEach(cleanup);

// No v1 Log screen or tests survived the R2 reskin pivot (git history has no
// prior Log component/route — R2 shipped a bare stub). These are written
// fresh against the repo's existing logRun/logPain overlay semantics
// (src/lib/data/repo.ts), per the R10 brief.

test("Log screen shows the imported Strava run with no SYNCED badge", async () => {
  render(<LogScreen />);

  expect(await screen.findByText("AUTO-IMPORTED · STRAVA")).toBeInTheDocument();
  expect(screen.getByText("Easy run")).toBeInTheDocument();
  expect(screen.getByText("4.0")).toBeInTheDocument();
  expect(screen.getByText("38:24")).toBeInTheDocument();
  expect(screen.getByText("9:36")).toBeInTheDocument();

  expect(screen.queryByText("SYNCED")).not.toBeInTheDocument();

  // Task 12: local mode has no sync concept — the stale marker never
  // renders, so this screen is byte-identical to pre-Task-12 local mode.
  expect(screen.queryByText(/STALE —/)).not.toBeInTheDocument();
});

test("Task 12: shows the stale marker under AUTO-IMPORTED · STRAVA when strava hasn't synced within the 1h activities threshold", async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600e3);
  getSyncStatusMock.mockResolvedValueOnce({
    whoop: { lastOkAt: new Date(), authBroken: false },
    strava: { lastOkAt: twoHoursAgo, authBroken: false },
  });

  render(<LogScreen />);

  await screen.findByText("AUTO-IMPORTED · STRAVA");
  expect(await screen.findByText("STALE — LAST SYNCED 2H AGO")).toBeInTheDocument();
});

test("RPE defaults to 4/10 and tapping a segment updates the readout", async () => {
  render(<LogScreen />);

  await screen.findByText("HOW HARD? · RPE");
  expect(screen.getByText("4")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "RPE 8" }));

  expect(await screen.findByText("8")).toBeInTheDocument();
});

test("pain chips default to the highest-severity seed area (achilles-l) with SEVERITY shown", async () => {
  render(<LogScreen />);

  const achillesL = await screen.findByRole("button", { name: "ACHILLES · L" });
  expect(achillesL).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "ACHILLES · R" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  expect(screen.getByText("SEVERITY")).toBeInTheDocument();
  // seed.pains achilles-l severity is 2
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("selecting NONE clears the pain selection and hides SEVERITY", async () => {
  render(<LogScreen />);

  await screen.findByRole("button", { name: "ACHILLES · L" });
  fireEvent.click(screen.getByRole("button", { name: "NONE" }));

  expect(screen.queryByText("SEVERITY")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "NONE" })).toHaveAttribute("aria-pressed", "true");
});

test("SAVE LOG writes rpe + pain via logRun and redirects to /today", async () => {
  render(<LogScreen />);

  await screen.findByRole("button", { name: "ACHILLES · L" });
  fireEvent.click(screen.getByRole("button", { name: "RPE 6" }));
  fireEvent.click(screen.getByRole("button", { name: "Severity 3" }));

  fireEvent.click(screen.getByRole("button", { name: "SAVE LOG" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith("/today"));

  const session = await localRepo.getSession("wed-400s");
  expect(session.status).toBe("completed");

  const pains = await localRepo.getPains();
  expect(pains.find((p) => p.id === "achilles-l")!.severity).toBe(3);
});

test("SAVE LOG with NONE selected omits pain fields but still logs the run", async () => {
  render(<LogScreen />);

  await screen.findByRole("button", { name: "ACHILLES · L" });
  fireEvent.click(screen.getByRole("button", { name: "NONE" }));
  fireEvent.click(screen.getByRole("button", { name: "SAVE LOG" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith("/today"));

  // achilles-l severity is untouched (still the seed default of 2), proving
  // no pain override was written for this save.
  const pains = await localRepo.getPains();
  expect(pains.find((p) => p.id === "achilles-l")!.severity).toBe(2);
});

test("I4: SAVE LOG rejection shows OFFLINE — TRY AGAIN, does not navigate; retry success clears it", async () => {
  const spy = vi
    .spyOn(localRepo, "logRun")
    .mockRejectedValueOnce(new OfflineError("logRun: write failed"));

  render(<LogScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "SAVE LOG" }));

  expect(await screen.findByText("OFFLINE — TRY AGAIN")).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();

  // Retry: the once-rejection is consumed, the spy calls through to the
  // real localRepo.logRun — success must clear the line and navigate.
  fireEvent.click(screen.getByRole("button", { name: "SAVE LOG" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/today"));
  expect(screen.queryByText("OFFLINE — TRY AGAIN")).not.toBeInTheDocument();

  spy.mockRestore();
});

test("I4: a non-network write rejection shows COULDN'T SAVE — TRY AGAIN", async () => {
  const spy = vi.spyOn(localRepo, "logRun").mockRejectedValueOnce(new Error("boom"));

  render(<LogScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "SAVE LOG" }));

  expect(await screen.findByText("COULDN'T SAVE — TRY AGAIN")).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();

  spy.mockRestore();
});

test("?focus=pain scrolls the pain section into view", async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;

  render(<LogScreen focusPain />);

  await screen.findByRole("button", { name: "ACHILLES · L" });
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
});
