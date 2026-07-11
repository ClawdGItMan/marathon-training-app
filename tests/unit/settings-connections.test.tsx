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

const { getIntegrationStatusMock, getSyncStatusMock } = vi.hoisted(() => ({
  getIntegrationStatusMock: vi.fn(),
  getSyncStatusMock: vi.fn(),
}));

vi.mock("@/lib/integrations/status", () => ({
  getIntegrationStatus: getIntegrationStatusMock,
}));

// Task 12: RECONNECT state. Defaults to "nothing broken" for every test
// below unless a test overrides it — mirrors getIntegrationStatusMock's
// per-test `mockResolvedValue` usage rather than needing every existing
// test in this file to know about sync status at all.
const NOT_BROKEN = { whoop: { lastOkAt: new Date(), authBroken: false }, strava: { lastOkAt: new Date(), authBroken: false } };
vi.mock("@/lib/sync/staleness", () => ({ getSyncStatus: getSyncStatusMock }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  getSyncStatusMock.mockResolvedValue(NOT_BROKEN);
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
    expect(getSyncStatusMock).not.toHaveBeenCalled();
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

  it("Task 12: shows RECONNECT instead of DISCONNECT when Whoop is connected but its last sync auth-failed", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: true, strava: false });
    getSyncStatusMock.mockResolvedValue({
      whoop: { lastOkAt: new Date(), authBroken: true },
      strava: { lastOkAt: new Date(), authBroken: false },
    });

    render(<ConnectionsSection />);

    expect(await screen.findByText("CONNECTED")).toBeInTheDocument();
    const reconnectLink = await screen.findByRole("link", { name: "RECONNECT" });
    // Same navigation as CONNECT — only the label differs (brief's exact wording).
    expect(reconnectLink).toHaveAttribute("href", "/api/integrations/whoop/connect");
    expect(screen.queryByRole("button", { name: "DISCONNECT" })).not.toBeInTheDocument();
  });

  it("Task 12: keeps DISCONNECT when Whoop is connected and its last sync succeeded", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: true, strava: false });
    getSyncStatusMock.mockResolvedValue({
      whoop: { lastOkAt: new Date(), authBroken: false },
      strava: { lastOkAt: new Date(), authBroken: false },
    });

    render(<ConnectionsSection />);

    expect(await screen.findByRole("button", { name: "DISCONNECT" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "RECONNECT" })).not.toBeInTheDocument();
  });

  it("Task 12: an unconnected row shows plain CONNECT even when authBroken is (nonsensically) true", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: false, strava: false });
    getSyncStatusMock.mockResolvedValue({
      whoop: { lastOkAt: new Date(), authBroken: true },
      strava: { lastOkAt: new Date(), authBroken: false },
    });

    render(<ConnectionsSection />);

    const connectLinks = await screen.findAllByRole("link", { name: "CONNECT" });
    expect(connectLinks).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "RECONNECT" })).not.toBeInTheDocument();
  });

  it("labels each row with its own provider name", async () => {
    getIntegrationStatusMock.mockResolvedValue({ whoop: true, strava: true });

    render(<ConnectionsSection />);

    await waitFor(() => expect(screen.getAllByText("CONNECTED")).toHaveLength(2));
    expect(screen.getByText("Whoop")).toBeInTheDocument();
    expect(screen.getByText("Strava")).toBeInTheDocument();
  });

  it("fix loop 1: fails open when getSyncStatus rejects — DISCONNECT (not RECONNECT), warning logged, no unhandled rejection", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getIntegrationStatusMock.mockResolvedValue({ whoop: true, strava: true });
    getSyncStatusMock.mockRejectedValue(new Error("sync_runs query failed"));

    render(<ConnectionsSection />);

    // A transient query failure must not fake an auth alarm — authBroken
    // stays at its initial false, so connected rows keep DISCONNECT.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "DISCONNECT" })).toHaveLength(2));
    expect(screen.queryByRole("link", { name: "RECONNECT" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail-open"), expect.any(Error))
    );
    warnSpy.mockRestore();
  });

  it("fix loop 1: fails open when getIntegrationStatus rejects — NOT CONNECTED + CONNECT, warning logged, no unhandled rejection", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getIntegrationStatusMock.mockRejectedValue(new Error("server action failed"));

    render(<ConnectionsSection />);

    // connected stays at its initial false — the row keeps the plain
    // CONNECT link rather than flashing a wrong CONNECTED/DISCONNECT state.
    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fail-open"), expect.any(Error))
    );
    expect(screen.getAllByText("NOT CONNECTED")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "CONNECT" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "DISCONNECT" })).not.toBeInTheDocument();
    warnSpy.mockRestore();
  });
});
