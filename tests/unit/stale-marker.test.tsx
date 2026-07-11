import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaleMarker } from "@/components/sync/StaleMarker";

/**
 * Behavioral tests for Task 12's `StaleMarker`: one mono line, "STALE — LAST
 * SYNCED {n}H AGO" (hours rounded down), rendered ONLY when the given
 * source's `lastOkAt` is further in the past than its threshold
 * (STALE_RECOVERY_MS for "whoop", STALE_ACTIVITIES_MS for "strava" — see
 * src/lib/sync/staleness.ts's getSyncStatus doc comment). `getSyncStatus`
 * itself is mocked here (real Supabase-query behavior is covered by
 * tests/unit/sync-staleness.test.ts) so these tests are pure
 * render-given-status assertions.
 */

const { getSyncStatusMock } = vi.hoisted(() => ({ getSyncStatusMock: vi.fn() }));

vi.mock("@/lib/sync/staleness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sync/staleness")>("@/lib/sync/staleness");
  return { ...actual, getSyncStatus: getSyncStatusMock };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOW = new Date("2026-07-11T12:00:00.000Z");

function statusWithLastOkAt(source: "whoop" | "strava", lastOkAt: Date | null, authBroken = false) {
  const other = source === "whoop" ? "strava" : "whoop";
  return {
    [source]: { lastOkAt, authBroken },
    [other]: { lastOkAt: NOW, authBroken: false },
  };
}

describe("StaleMarker", () => {
  it("renders nothing while the sync status fetch is in flight", () => {
    getSyncStatusMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<StaleMarker sourceKey="whoop" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when whoop is within the 3h recovery threshold", async () => {
    vi.setSystemTime(NOW);
    const lastOkAt = new Date(NOW.getTime() - 2 * 3600e3); // 2h ago, threshold is >3h
    getSyncStatusMock.mockResolvedValue(statusWithLastOkAt("whoop", lastOkAt));

    render(<StaleMarker sourceKey="whoop" />);

    await waitFor(() => expect(getSyncStatusMock).toHaveBeenCalled());
    expect(screen.queryByText(/STALE/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders the exact stale text for whoop past the 3h recovery threshold, hours rounded down", async () => {
    vi.setSystemTime(NOW);
    // 3h59m ago -> elapsed 3.98h, floor = 3.
    const lastOkAt = new Date(NOW.getTime() - (3 * 3600e3 + 59 * 60e3));
    getSyncStatusMock.mockResolvedValue(statusWithLastOkAt("whoop", lastOkAt));

    render(<StaleMarker sourceKey="whoop" />);

    expect(await screen.findByText("STALE — LAST SYNCED 3H AGO")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders nothing for strava within the 1h activities threshold", async () => {
    vi.setSystemTime(NOW);
    const lastOkAt = new Date(NOW.getTime() - 30 * 60e3); // 30min ago, threshold is >1h
    getSyncStatusMock.mockResolvedValue(statusWithLastOkAt("strava", lastOkAt));

    render(<StaleMarker sourceKey="strava" />);

    await waitFor(() => expect(getSyncStatusMock).toHaveBeenCalled());
    expect(screen.queryByText(/STALE/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders the exact stale text for strava past the 1h activities threshold", async () => {
    vi.setSystemTime(NOW);
    // 5h ago -> floor(5) = 5.
    const lastOkAt = new Date(NOW.getTime() - 5 * 3600e3);
    getSyncStatusMock.mockResolvedValue(statusWithLastOkAt("strava", lastOkAt));

    render(<StaleMarker sourceKey="strava" />);

    expect(await screen.findByText("STALE — LAST SYNCED 5H AGO")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders nothing when lastOkAt is null (never synced — no instant to report)", async () => {
    getSyncStatusMock.mockResolvedValue(statusWithLastOkAt("whoop", null));

    render(<StaleMarker sourceKey="whoop" />);

    await waitFor(() => expect(getSyncStatusMock).toHaveBeenCalled());
    expect(screen.queryByText(/STALE/)).not.toBeInTheDocument();
  });

  it("uses the exact Instrument idiom: mono 10px, .18em tracking, #5c6168", async () => {
    vi.setSystemTime(NOW);
    const lastOkAt = new Date(NOW.getTime() - 10 * 3600e3);
    getSyncStatusMock.mockResolvedValue(statusWithLastOkAt("whoop", lastOkAt));

    render(<StaleMarker sourceKey="whoop" />);

    const marker = await screen.findByText("STALE — LAST SYNCED 10H AGO");
    expect(marker).toHaveClass("font-mono", "text-[10px]", "tracking-[.18em]", "text-[#5c6168]");
    vi.useRealTimers();
  });
});

// "Hidden in local mode with the REAL (unmocked) getSyncStatus" is exercised
// by tests/unit/body.test.tsx, today.test.tsx, and log.test.tsx instead of
// here — this file mocks "@/lib/sync/staleness" at module scope for every
// test above, and unmocking mid-file to import a fresh, real module instance
// is exactly the kind of module-cache fragility CLAUDE.md's TDD guidance
// warns against. Those screen tests run with NEXT_PUBLIC_REPO_MODE unset
// (the vitest default — see vitest.config.ts, no .env loaded) and assert
// `queryByText(/STALE/)` is absent using the real component + real
// getSyncStatus's local-mode early return, which is the more faithful place
// to prove screens render byte-identical in local mode.
