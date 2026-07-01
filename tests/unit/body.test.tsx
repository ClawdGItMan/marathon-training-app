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

  // Ghost CTA button.
  expect(
    await screen.findByText("+ Log soreness or injury")
  ).toBeInTheDocument();
});

test("Tapping the Achilles · Left hotspot sets aria-pressed", async () => {
  render(<BodyScreen />);

  const hotspot = await screen.findByRole("button", { name: "Achilles · Left" });
  expect(hotspot).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(hotspot);

  expect(hotspot).toHaveAttribute("aria-pressed", "true");
});
