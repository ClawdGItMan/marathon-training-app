import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ModifySheet } from "@/components/today/ModifySheet";
import { seed } from "@/lib/data/seed";

afterEach(cleanup);

// proposal-1's `after` session (Easy · 4 mi · 9:30/mi) — what the sheet prefills from.
const session = seed.proposals[0].after;

function setup() {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(<ModifySheet session={session} onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

test("empty title blocks save and shows inline error", () => {
  const { onSave } = setup();
  fireEvent.change(screen.getByLabelText("TITLE"), { target: { value: "  " } });
  fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText("Title is required.")).toBeInTheDocument();
});

test("non-positive distance blocks save and shows inline error", () => {
  const { onSave } = setup();
  fireEvent.change(screen.getByLabelText("DISTANCE (MI)"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText("Distance must be a positive number.")).toBeInTheDocument();
});

test("valid edit calls onSave with the edited session", () => {
  const { onSave } = setup();
  fireEvent.change(screen.getByLabelText("TITLE"), { target: { value: "Easy shakeout" } });
  fireEvent.change(screen.getByLabelText("DISTANCE (MI)"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  const edited = onSave.mock.calls[0][0];
  expect(edited.title).toBe("Easy shakeout");
  expect(edited.distanceMi).toBe(3);
  expect(edited.id).toBe(session.id);
});
