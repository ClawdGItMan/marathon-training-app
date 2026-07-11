import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionsSection } from "@/components/settings/ConnectionsSection";

/**
 * Behavioral tests for the Settings CONNECTIONS row (Tasks 7/10): local
 * mode must render byte-identical to the Phase-1 static row (the 42-test
 * e2e suite runs in local mode and asserts this exact markup — see
 * tests/e2e/settings.spec.ts), while supabase mode wires BOTH Whoop's and
 * Strava's rows to real status via the getIntegrationStatus server action
 * (mocked here) and a live CONNECT link / DISCONNECT button — both
 * providers share the same ConnectionRow component (parameterized by
 * provider), so these tests exercise each provider independently to prove
 * the parameterization actually threads the right provider through, not
 * just Whoop's hardcoded path.
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

  it("shows a live CONNECT link for both providers when neither is connected", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: false, strava: false });

    render(<ConnectionsSection />);

    const connectLinks = await screen.findAllByRole("link", { name: "CONNECT" });
    expect(connectLinks).toHaveLength(2);
    expect(connectLinks.map((link) => link.getAttribute("href")).sort()).toEqual([
      "/api/integrations/strava/connect",
      "/api/integrations/whoop/connect",
    ]);
    expect(screen.getAllByText("NOT CONNECTED")).toHaveLength(2);
    // Neither provider keeps the disabled Phase-1 placeholder anymore.
    expect(screen.queryByText("PHASE 2")).not.toBeInTheDocument();
  });

  it("shows CONNECTED + a DISCONNECT action for Whoop only when just Whoop has a token", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: true, strava: false });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConnectionsSection />);

    const disconnectButton = await screen.findByRole("button", { name: "DISCONNECT" });
    expect(screen.getByText("CONNECTED")).toBeInTheDocument();
    // Strava is still live but unconnected — exactly one CONNECT link left.
    expect(screen.getByRole("link", { name: "CONNECT" })).toHaveAttribute(
      "href",
      "/api/integrations/strava/connect"
    );

    fireEvent.click(disconnectButton);

    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/whoop/connect", {
      method: "DELETE",
    });

    await waitFor(() => expect(screen.getAllByRole("link", { name: "CONNECT" })).toHaveLength(2));
    expect(screen.queryByText("CONNECTED")).not.toBeInTheDocument();
  });

  it("shows CONNECTED + a DISCONNECT action for Strava only when just Strava has a token", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: false, strava: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConnectionsSection />);

    const disconnectButton = await screen.findByRole("button", { name: "DISCONNECT" });
    expect(screen.getByText("CONNECTED")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CONNECT" })).toHaveAttribute(
      "href",
      "/api/integrations/whoop/connect"
    );

    fireEvent.click(disconnectButton);

    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/strava/connect", {
      method: "DELETE",
    });

    await waitFor(() => expect(screen.getAllByRole("link", { name: "CONNECT" })).toHaveLength(2));
    expect(screen.queryByText("CONNECTED")).not.toBeInTheDocument();
  });

  it("labels each row with its own provider name", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: true, strava: true });

    render(<ConnectionsSection />);

    await waitFor(() => expect(screen.getAllByText("CONNECTED")).toHaveLength(2));
    expect(screen.getByText("Whoop")).toBeInTheDocument();
    expect(screen.getByText("Strava")).toBeInTheDocument();
  });
});
