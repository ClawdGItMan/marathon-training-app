import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { BodyScreen } from "@/components/body/BodyScreen";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("Body screen shows recovery analytics and pain manager", async () => {
  render(<BodyScreen />);

  // Recovery hero ring value.
  expect(await screen.findByText("62")).toBeInTheDocument();

  // Section headers.
  expect(await screen.findByText("VITALS")).toBeInTheDocument();
  expect(await screen.findByText("SLEEP")).toBeInTheDocument();
  expect(await screen.findByText("PAIN & INJURIES")).toBeInTheDocument();

  // Sleep card — regression guard: EFFICIENCY must show efficiencyPct (88),
  // never sleepScorePct (78). This split was a hard-won review fix in Task 9.
  expect(await screen.findByText("EFFICIENCY")).toBeInTheDocument();
  expect(await screen.findByText("88%")).toBeInTheDocument();
  expect(screen.queryByText("78%")).not.toBeInTheDocument();

  // Pain area row.
  expect(await screen.findByText("ACHILLES · LEFT")).toBeInTheDocument();

  // Ghost CTA button — uppercase mono per Instrument brief (#7d/#7e ghost
  // button convention), a deliberate casing change from the v1 sentence case.
  expect(
    await screen.findByText("+ LOG SORENESS OR INJURY")
  ).toBeInTheDocument();
});

test("Tapping the Achilles · Left hotspot sets aria-pressed", async () => {
  render(<BodyScreen />);

  const hotspot = await screen.findByRole("button", { name: "Achilles · Left" });
  expect(hotspot).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(hotspot);

  expect(hotspot).toHaveAttribute("aria-pressed", "true");
});

test("Instrument restyle: section headers and computed 7-day average match #7c", async () => {
  render(<BodyScreen />);

  expect(await screen.findByText("14 DAYS →")).toBeInTheDocument();
  // Computed from seed recovery7d (69+59+63+56+72+67+62)/7 = 64, not hardcoded.
  expect(await screen.findByText("64% AVG")).toBeInTheDocument();
});

test("Pain area rows use a white-filled segment meter and lime 'improving' trend, no v1 orange", async () => {
  const { container } = render(<BodyScreen />);

  await screen.findByText("ACHILLES · LEFT");

  const filledSegments = container.querySelectorAll('[data-filled="true"]');
  expect(filledSegments.length).toBeGreaterThan(0);
  filledSegments.forEach((seg) => {
    expect((seg as HTMLElement).style.backgroundColor).toBe("rgb(255, 255, 255)");
  });

  const improvingTrend = await screen.findByText(/improving/);
  expect(improvingTrend).toHaveStyle({ color: "rgb(201, 245, 63)" });

  expect(container.innerHTML).not.toContain("#FF9A3D");
  expect(container.innerHTML).not.toContain("#FFCE3F");
});
