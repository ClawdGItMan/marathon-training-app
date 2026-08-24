import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { DemoProvider } from "@/components/shell/demo-context";
import { DemoBadge } from "@/components/shell/DemoBadge";
import { PageHeader } from "@/components/shell/PageHeader";

afterEach(cleanup);

describe("DemoBadge", () => {
  test("renders the mono DEMO label inside a demo session", () => {
    render(
      <DemoProvider isDemo>
        <DemoBadge />
      </DemoProvider>,
    );
    expect(screen.getByText("DEMO")).toBeInTheDocument();
  });

  test("renders nothing outside a demo session", () => {
    render(
      <DemoProvider isDemo={false}>
        <DemoBadge />
      </DemoProvider>,
    );
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
  });

  test("renders nothing with no provider at all (local mode)", () => {
    render(<DemoBadge />);
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
  });
});

describe("PageHeader demo slot", () => {
  test("shows DEMO next to the ASK COACH chip in a demo session", () => {
    render(
      <DemoProvider isDemo>
        <PageHeader title="Today" from="today" />
      </DemoProvider>,
    );
    expect(screen.getByText("DEMO")).toBeInTheDocument();
    expect(screen.getByLabelText("ASK COACH")).toBeInTheDocument();
  });

  test("is unchanged outside demo", () => {
    render(<PageHeader title="Today" from="today" />);
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
  });
});
