import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ProgressScreen } from "@/components/progress/ProgressScreen";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("Progress screen shows streak, focus, this-week stats, and predictions", async () => {
  render(<ProgressScreen />);

  expect(await screen.findByText("Honolulu Marathon")).toBeInTheDocument();
  expect(screen.getByText("12-DAY STREAK")).toBeInTheDocument();
  expect(screen.getByText("YOUR FOCUS")).toBeInTheDocument();
  expect(screen.getByText("Dec 13")).toBeInTheDocument();
  expect(screen.getByText("24 WKS LEFT")).toBeInTheDocument();
  expect(screen.getByText("THIS WEEK · RUN")).toBeInTheDocument();
  expect(await screen.findByText("3:56:10")).toBeInTheDocument();
  expect(await screen.findByText("vs 4:00 goal")).toBeInTheDocument();
  expect(await screen.findByText("−2:12")).toBeInTheDocument();
  expect(await screen.findByText("PREDICTIONS")).toBeInTheDocument();
  expect(screen.getByText("30-DAY TREND")).toBeInTheDocument();
});

test("Fitness card is not rendered (deleted in Instrument #7b)", async () => {
  render(<ProgressScreen />);

  await screen.findByText("Honolulu Marathon");
  expect(screen.queryByText("FITNESS")).not.toBeInTheDocument();
});

test("3M range is selected by default and 1M toggle re-scopes the chart to 4 points", async () => {
  render(<ProgressScreen />);

  await screen.findByText("Honolulu Marathon");
  expect(screen.getByText("3M")).toHaveClass("border-sig");

  fireEvent.click(screen.getByText("1M"));

  const chart = screen.getByTestId("week-chart");
  const polyline = chart.querySelector("polyline");
  expect(polyline).toBeTruthy();
  const pointCount = polyline!.getAttribute("points")!.trim().split(/\s+/).length;
  expect(pointCount).toBe(4);
});

test("Progress RangeTabs match design-v2 #7b spec: pt-18px, tracking-.14em", async () => {
  render(<ProgressScreen />);

  await screen.findByText("Honolulu Marathon");

  // RangeTabs container: pt-[18px]
  const tabContainer = screen.getByText("1W").parentElement;
  expect(tabContainer).toHaveClass("pt-[18px]");

  // Each tab button: tracking-[.14em]
  expect(screen.getByText("1W")).toHaveClass("tracking-[.14em]");
  expect(screen.getByText("1M")).toHaveClass("tracking-[.14em]");
  expect(screen.getByText("3M")).toHaveClass("tracking-[.14em]");
  expect(screen.getByText("1Y")).toHaveClass("tracking-[.14em]");
});
