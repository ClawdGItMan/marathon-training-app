import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionsSection } from "@/components/settings/ConnectionsSection";

/**
 * Behavioral tests for the Settings CONNECTIONS row (Task 7): local mode
 * must render byte-identical to the Phase-1 static row (the 42-test e2e
 * suite runs in local mode and asserts this exact markup — see
 * tests/e2e/settings.spec.ts), while supabase mode wires Whoop's row to
 * real status via the getIntegrationStatus server action (mocked here) and
 * a live CONNECT link / DISCONNECT button. Strava has no Task 7 route yet,
 * so its row stays the static Phase-1 placeholder in both modes.
 */

const { getIntegrationStatusMock } = vi.hoisted(() => ({
  getIntegrationStatusMock: vi.fn(),
}));

vi.mock("@/lib/integrations/status", () => ({
  getIntegrationStatus: getIntegrationStatusMock,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ConnectionsSection (local mode)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "local");
  });

  it("renders the static Phase-1 row for both providers and never calls getIntegrationStatus", () => {
    render(<ConnectionsSection />);

    expect(screen.getByText("Whoop")).toBeInTheDocument();
    expect(screen.getByText("Strava")).toBeInTheDocument();
    expect(screen.getAllByText("NOT CONNECTED")).toHaveLength(2);

    const connectButtons = screen.getAllByRole("button", {
      name: /Connect .* — available in Phase 2/,
    });
    expect(connectButtons).toHaveLength(2);
    for (const button of connectButtons) {
      expect(button).toBeDisabled();
    }
    expect(getIntegrationStatusMock).not.toHaveBeenCalled();
  });
});

describe("ConnectionsSection (supabase mode)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "supabase");
  });

  it("shows a live CONNECT link for Whoop when not connected, and keeps Strava's static placeholder", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: false, strava: false });

    render(<ConnectionsSection />);

    const connectLink = await screen.findByRole("link", { name: "CONNECT" });
    expect(connectLink).toHaveAttribute("href", "/api/integrations/whoop/connect");
    expect(screen.getAllByText("NOT CONNECTED")).toHaveLength(2); // Whoop (live) + Strava (static)

    // Strava keeps the Phase-1 disabled placeholder — Task 7 only wires Whoop.
    expect(
      screen.getByRole("button", { name: "Connect Strava — available in Phase 2" })
    ).toBeDisabled();
  });

  it("shows CONNECTED + a DISCONNECT action for Whoop when a token exists, and disconnecting flips it back", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: true, strava: false });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConnectionsSection />);

    const disconnectButton = await screen.findByRole("button", { name: "DISCONNECT" });
    expect(screen.getByText("CONNECTED")).toBeInTheDocument();

    fireEvent.click(disconnectButton);

    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/whoop/connect", {
      method: "DELETE",
    });

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "CONNECT" })).toHaveAttribute(
        "href",
        "/api/integrations/whoop/connect"
      )
    );
    expect(screen.queryByText("CONNECTED")).not.toBeInTheDocument();
  });
});
