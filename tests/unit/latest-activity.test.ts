// @vitest-environment node
//
// Final-review fix I3: Log's AUTO-IMPORTED · STRAVA card reads
// supabaseRepo.getLatestActivity — it must never present a Whoop-only
// workout (no strava_id: strength session, unmatched treadmill run, ...) as
// a Strava import. The newest STRAVA-SOURCED row wins; a whoop-only row
// being newest is invisible to this card.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAdmin, type Row } from "../helpers/fake-admin";

const { getBrowserClientMock } = vi.hoisted(() => ({ getBrowserClientMock: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: getBrowserClientMock }));

const { supabaseRepo } = await import("@/lib/data/supabase-repo");
const { seed } = await import("@/lib/data/seed");

const USER_ID = "00000000-0000-0000-0000-000000000001";

function stravaRow(overrides: Row = {}): Row {
  return {
    id: globalThis.crypto.randomUUID(),
    user_id: USER_ID,
    strava_id: 111,
    whoop_id: null,
    sport: "Run",
    started_at: "2026-07-08T11:00:00Z",
    ended_at: "2026-07-08T11:40:00Z",
    distance_m: 6437.376,
    moving_sec: 2304,
    avg_pace_sec_per_mi: 576,
    payload: { title: "Morning run" },
    ...overrides,
  };
}

function whoopRow(overrides: Row = {}): Row {
  return {
    id: globalThis.crypto.randomUUID(),
    user_id: USER_ID,
    strava_id: null,
    whoop_id: "whoop-1",
    sport: "running",
    started_at: "2026-07-09T11:00:00Z",
    ended_at: "2026-07-09T11:40:00Z",
    distance_m: null,
    moving_sec: null,
    avg_pace_sec_per_mi: null,
    payload: {},
    ...overrides,
  };
}

function setupActivities(rows: Row[]) {
  const { client, tables } = createFakeAdmin(["activities"] as const);
  for (const row of rows) tables.activities.seed(row);
  getBrowserClientMock.mockReturnValue(client);
}

beforeEach(() => {
  getBrowserClientMock.mockReset();
});

describe("supabaseRepo.getLatestActivity (strava-sourced only)", () => {
  it("whoop-only newest row -> the previous strava row is returned instead", async () => {
    setupActivities([stravaRow(), whoopRow()]); // whoop row is newer

    const activity = await supabaseRepo.getLatestActivity();

    expect(activity).not.toBeNull();
    expect(activity!.title).toBe("Morning run");
    expect(activity!.date).toBe("2026-07-08");
  });

  it("newest strava row wins when several strava rows exist", async () => {
    setupActivities([
      stravaRow(),
      stravaRow({
        strava_id: 222,
        started_at: "2026-07-10T11:00:00Z",
        ended_at: "2026-07-10T11:30:00Z",
        payload: { title: "Tempo run" },
      }),
      whoopRow(),
    ]);

    const activity = await supabaseRepo.getLatestActivity();
    expect(activity!.title).toBe("Tempo run");
  });

  it("only whoop rows (no strava import yet) -> seed fallback, same as zero rows", async () => {
    setupActivities([whoopRow()]);

    const activity = await supabaseRepo.getLatestActivity();
    expect(activity).toEqual(seed.activities.at(-1));
  });
});
