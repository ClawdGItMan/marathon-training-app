import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TypeTag } from "@/components/ui/TypeTag";
import { StatGrid } from "@/components/ui/StatGrid";
import { SegmentMeter } from "@/components/ui/SegmentMeter";
import { ProgressTicks } from "@/components/ui/ProgressTicks";

test("Card applies .card class", () => {
  const { container } = render(<Card>content</Card>);
  expect(container.firstChild).toHaveClass("card");
});

test("SectionHeader shows label and optional action", () => {
  render(<SectionHeader label="Today's Session" accent="#16e06a" action="Edit" actionHref="/plan" />);
  expect(screen.getByText("Today's Session")).toBeInTheDocument();
  const action = screen.getByText("Edit");
  expect(action.closest("a")).toHaveAttribute("href", "/plan");
});

test("TypeTag renders uppercase type", () => {
  render(<TypeTag type="tempo" />);
  expect(screen.getByText("TEMPO")).toBeInTheDocument();
});

test("StatGrid shows values with font-num class", () => {
  render(
    <StatGrid
      items={[
        { label: "Distance", value: "32", unit: "mi" },
        { label: "Time", value: "4:48" },
        { label: "Avg Pace", value: "9:01" },
      ]}
    />
  );
  const value = screen.getByText("32");
  expect(value).toHaveClass("font-num");
  expect(screen.getByText("mi")).toBeInTheDocument();
});

test("SegmentMeter fills to value", () => {
  const { container } = render(<SegmentMeter value={2} />);
  expect(container.querySelectorAll("[data-filled=true]").length).toBe(2);
  expect(container.querySelectorAll("[data-filled=false]").length).toBe(8);
});

test("ProgressTicks renders total ticks with done filled", () => {
  const { container } = render(<ProgressTicks done={4} total={12} />);
  const ticks = container.querySelectorAll("[data-tick]");
  expect(ticks.length).toBe(12);
  expect(container.querySelectorAll("[data-filled=true]").length).toBe(4);
});
