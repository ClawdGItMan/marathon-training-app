import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { TodayScreen } from "@/components/today/TodayScreen";

beforeEach(() => localStorage.clear());

test("Today screen shows recommendation, race line, session card, and rings", async () => {
  render(<TodayScreen />);

  expect(await screen.findByText("Ease off today.")).toBeInTheDocument();
  expect(await screen.findByText("HONOLULU MARATHON")).toBeInTheDocument();
  expect(await screen.findByText("TODAY'S SESSION")).toBeInTheDocument();

  const struck = await screen.findByText("TEMPO · 6 MI");
  expect(struck).toHaveClass("line-through");

  expect(await screen.findByText("62")).toBeInTheDocument();
  expect(await screen.findByText("78%")).toBeInTheDocument();
  expect(await screen.findByText("1.28")).toBeInTheDocument();
});
