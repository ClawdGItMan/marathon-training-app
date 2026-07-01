import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ProgressScreen } from "@/components/progress/ProgressScreen";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("Progress screen shows focus, this-week stats, predictions, and fitness", async () => {
  render(<ProgressScreen />);

  expect(await screen.findByText("Honolulu Marathon")).toBeInTheDocument();
  expect(await screen.findByText("3:56:10")).toBeInTheDocument();
  expect(await screen.findByText("vs 4:00 goal")).toBeInTheDocument();
  expect(await screen.findByText("PREDICTIONS")).toBeInTheDocument();
  expect(await screen.findByText("FITNESS")).toBeInTheDocument();
});

test("1M toggle re-scopes the This Week chart to 4 points", async () => {
  render(<ProgressScreen />);

  await screen.findByText("Honolulu Marathon");

  fireEvent.click(screen.getByText("1M"));

  const chart = screen.getByTestId("week-chart");
  const polyline = chart.querySelector("polyline");
  expect(polyline).toBeTruthy();
  const pointCount = polyline!.getAttribute("points")!.trim().split(/\s+/).length;
  expect(pointCount).toBe(4);
});
