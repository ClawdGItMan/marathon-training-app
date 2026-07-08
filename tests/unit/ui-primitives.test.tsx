import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CornerTickBox } from "@/components/ui/CornerTickBox";
import { TypeTag } from "@/components/ui/TypeTag";
import { StatGrid } from "@/components/ui/StatGrid";
import { SegmentMeter } from "@/components/ui/SegmentMeter";
import { ProgressTicks } from "@/components/ui/ProgressTicks";

test("Card applies .card class", () => {
  const { container } = render(<Card>content</Card>);
  expect(container.firstChild).toHaveClass("card");
});

test("SectionHeader shows label and optional action (v1 compat)", () => {
  render(<SectionHeader label="Today's Session" accent="#16e06a" action="Edit" actionHref="/plan" />);
  expect(screen.getByText("Today's Session")).toBeInTheDocument();
  const action = screen.getByText("Edit");
  expect(action.closest("a")).toHaveAttribute("href", "/plan");
});

test("SectionHeader renders mono label uppercase-styled and ignores accent visually", () => {
  const { container } = render(<SectionHeader label="this week" accent="#16e06a" />);
  const label = screen.getByText("this week");
  expect(label).toHaveClass("font-mono");
  // accent must not be applied as any inline color/background — dropped per Instrument spec
  expect(container.querySelector('[style*="#16e06a"]')).toBeNull();
});

test("SectionHeader context prop is the preferred alias for action", () => {
  render(<SectionHeader label="THIS WEEK" accent="#16e06a" context="32 / 41 MI" />);
  expect(screen.getByText("32 / 41 MI")).toBeInTheDocument();
});

test("Section renders header row, children, and closes with a hairline rule", () => {
  const { container } = render(
    <Section header={{ label: "VITALS", context: "14 DAYS →" }}>
      <div>body content</div>
    </Section>
  );
  expect(screen.getByText("VITALS")).toBeInTheDocument();
  expect(screen.getByText("14 DAYS →")).toBeInTheDocument();
  expect(screen.getByText("body content")).toBeInTheDocument();
  expect(container.firstChild).toHaveClass("hairline");
});

test("Section renders without a header when omitted", () => {
  const { container } = render(
    <Section>
      <div>just content</div>
    </Section>
  );
  expect(screen.getByText("just content")).toBeInTheDocument();
  expect(container.firstChild).toHaveClass("hairline");
});

test("CornerTickBox renders a hairline box with a lime corner bracket and optional label/context", () => {
  const { container } = render(
    <CornerTickBox label="COACH" context="~44 MIN">
      <div>Try 5 × 600m instead</div>
    </CornerTickBox>
  );
  expect(screen.getByText("COACH")).toBeInTheDocument();
  expect(screen.getByText("~44 MIN")).toBeInTheDocument();
  expect(screen.getByText("Try 5 × 600m instead")).toBeInTheDocument();

  const box = container.firstChild as HTMLElement;
  expect(box.style.border).toContain("1px");
  expect(box.style.position).toBe("relative");

  const bracket = container.querySelector("[data-corner-tick]");
  expect(bracket).not.toBeNull();
  expect(bracket).toHaveStyle({ width: "14px", height: "14px" });
});

test("CornerTickBox renders without label/context", () => {
  render(
    <CornerTickBox>
      <div>just body</div>
    </CornerTickBox>
  );
  expect(screen.getByText("just body")).toBeInTheDocument();
});

test("TypeTag renders uppercase mono grey label with no chip background", () => {
  const { container } = render(<TypeTag type="tempo" />);
  const tag = screen.getByText("TEMPO");
  expect(tag).toBeInTheDocument();
  expect(tag).toHaveClass("font-mono");
  const el = container.firstChild as HTMLElement;
  expect(el.style.backgroundColor).toBe("");
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

test("StatGrid uses hairline column separators, not v1 rgba borders", () => {
  const { container } = render(
    <StatGrid
      items={[
        { label: "Distance", value: "32", unit: "mi" },
        { label: "Time", value: "4:48" },
      ]}
    />
  );
  expect(container.querySelector(".border-white\\/\\[\\.08\\]")).toBeNull();
  expect(container.querySelector(".hairline-r, [data-col-rule]")).not.toBeNull();
});

test("StatGrid rule={false} omits column separators (Progress #7b gap-only stat row)", () => {
  const { container } = render(
    <StatGrid
      rule={false}
      items={[
        { label: "Distance", value: "32", unit: "mi" },
        { label: "Time", value: "4:48" },
      ]}
    />
  );
  expect(container.querySelector(".hairline-r, [data-col-rule]")).toBeNull();
});

test("SegmentMeter fills to value", () => {
  const { container } = render(<SegmentMeter value={2} />);
  expect(container.querySelectorAll("[data-filled=true]").length).toBe(2);
  expect(container.querySelectorAll("[data-filled=false]").length).toBe(8);
});

test("SegmentMeter defaults to lime fill color", () => {
  const { container } = render(<SegmentMeter value={1} />);
  const filled = container.querySelector("[data-filled=true]") as HTMLElement;
  expect(filled.style.backgroundColor).toBe("rgb(201, 245, 63)");
});

test("SegmentMeter defaults to 26px segments when height is omitted", () => {
  const { container } = render(<SegmentMeter value={1} />);
  const seg = container.querySelector("[data-filled=true]") as HTMLElement;
  expect(seg.style.height).toBe("26px");
});

test("SegmentMeter renders thin segments for a custom height (Log SEVERITY, design #7d)", () => {
  const { container } = render(<SegmentMeter value={2} height={8} color="#fff" />);
  const seg = container.querySelector("[data-filled=true]") as HTMLElement;
  expect(seg.style.height).toBe("8px");
  expect(seg.style.backgroundColor).toBe("rgb(255, 255, 255)");
});

test("SegmentMeter is read-only (spans) when no onChange is given", () => {
  const { container } = render(<SegmentMeter value={2} />);
  expect(container.querySelector("button")).toBeNull();
  expect(container.querySelectorAll("span[data-filled]").length).toBe(10);
});

test("SegmentMeter renders clickable segments and reports the tapped value (Log RPE, design #7d)", () => {
  const onChange = vi.fn();
  render(<SegmentMeter value={4} onChange={onChange} ariaLabel="RPE" />);

  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "RPE 7" }));

  expect(onChange).toHaveBeenCalledWith(7);
});

test("ProgressTicks renders total ticks with done filled", () => {
  const { container } = render(<ProgressTicks done={4} total={12} />);
  const ticks = container.querySelectorAll("[data-tick]");
  expect(ticks.length).toBe(12);
  expect(container.querySelectorAll("[data-filled=true]").length).toBe(4);
});

test("ProgressTicks current prop renders same lime fill as done (no amber current color)", () => {
  const { container } = render(<ProgressTicks done={4} total={12} current />);
  const ticks = Array.from(container.querySelectorAll("[data-tick]")) as HTMLElement[];
  // every tick uses only lime or empty grey — no amber/#FFCE3F anywhere
  ticks.forEach((tick) => {
    expect(tick.style.backgroundColor).not.toBe("rgb(255, 206, 63)");
  });
});
