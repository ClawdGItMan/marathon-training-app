import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PlanScreen } from "@/components/plan/PlanScreen";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("Plan screen (RUN tab) shows block header, periodization chart, and this-week day rows", async () => {
  render(<PlanScreen />);

  expect(await screen.findByText("Plan")).toBeInTheDocument();
  expect(screen.getByText("BLOCK 2 · BUILD · WK 07/16")).toBeInTheDocument();

  // RUN is active by default.
  expect(screen.getByText("RUN")).toHaveClass("border-sig");
  expect(screen.getByText("16-WEEK BLOCK")).toBeInTheDocument();
  expect(screen.getByText("PEAK 52 MI/WK")).toBeInTheDocument();

  // THIS WEEK context + all 7 day rows, today's row carrying the TODAY marker.
  expect(screen.getByText("THIS WEEK")).toBeInTheDocument();
  expect(screen.getByText("32 / 41 MI")).toBeInTheDocument();
  expect(screen.getAllByText("Easy run").length).toBe(2);
  expect(screen.getByText("Long run")).toBeInTheDocument();
  expect(await screen.findByText("Rolling 400s")).toBeInTheDocument();
  expect(screen.getByText("TODAY")).toBeInTheDocument();

  // Today's row links to the workout detail route (route lands in R9).
  expect(screen.getByText("Rolling 400s").closest("a")).toHaveAttribute(
    "href",
    "/workout/wed-400s"
  );
});

test("STRENGTH tab shows phase tracker, checklist, and COACH note", async () => {
  render(<PlanScreen />);

  fireEvent.click(await screen.findByText("STRENGTH"));

  expect(screen.getByText("MAX STRENGTH · DELOAD")).toBeInTheDocument();
  expect(screen.getByText("Volume −20% to match easy running.")).toBeInTheDocument();
  expect(screen.getByText("MAX")).toBeInTheDocument();

  expect(screen.getByText("WEDNESDAY · LOWER")).toBeInTheDocument();
  expect(screen.getByText("~35 MIN")).toBeInTheDocument();
  expect(screen.getByText("Back squat")).toBeInTheDocument();
  expect(screen.getByText("Heavy · 185 lb")).toBeInTheDocument();
  expect(screen.getByText("3×5")).toBeInTheDocument();
  expect(screen.getByText("Side plank")).toBeInTheDocument();

  expect(screen.getByText("COACH")).toBeInTheDocument();
  expect(
    screen.getByText("Keep the calf raises slow — skip them if morning stiffness is above 3.")
  ).toBeInTheDocument();
});

test("STRENGTH checklist ring toggles independently of opening the detail sheet", async () => {
  render(<PlanScreen />);
  fireEvent.click(await screen.findByText("STRENGTH"));

  const ring = screen.getByRole("button", { name: "Toggle complete: Back squat" });
  expect(ring).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(ring);
  expect(ring).toHaveAttribute("aria-pressed", "true");

  // Toggling the ring must not open the detail sheet.
  expect(screen.queryByText("CLOSE")).not.toBeInTheDocument();
});

test("tapping an exercise opens the detail sheet with a generic fallback illustration slot", async () => {
  render(<PlanScreen />);
  fireEvent.click(await screen.findByText("STRENGTH"));

  fireEvent.click(screen.getByRole("button", { name: "Exercise detail: Back squat" }));

  expect(await screen.findByText("CLOSE")).toBeInTheDocument();
  expect(screen.getAllByText("Back squat").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Heavy · 185 lb").length).toBe(2);
  expect(screen.getByText("quadriceps · glutes · core")).toBeInTheDocument();

  fireEvent.click(screen.getByText("CLOSE"));
  expect(screen.queryByText("CLOSE")).not.toBeInTheDocument();
});

test("Plan RUN/STRENGTH tabs match design-v2 #7a/#7e spec: pt-20px, tracking-.16em", async () => {
  render(<PlanScreen />);

  await screen.findByText("Plan");

  // PlanTabs container: pt-[20px]
  const tabContainer = screen.getByText("RUN").parentElement;
  expect(tabContainer).toHaveClass("pt-[20px]");

  // Each tab button: tracking-[.16em]
  expect(screen.getByText("RUN")).toHaveClass("tracking-[.16em]");
  expect(screen.getByText("STRENGTH")).toHaveClass("tracking-[.16em]");
});
