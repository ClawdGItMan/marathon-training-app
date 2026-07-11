import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for Task 12's `getSyncStatus` (src/lib/sync/staleness.ts):
 * local mode returns all-fresh WITHOUT touching Supabase; supabase mode
 * derives `lastOkAt` from the latest `ok = true` sync_runs row and
 * `authBroken` from whether the single latest row (any ok value) failed
 * with a `401`-tagged detail (the only signal whoop/sync.ts's and
 * strava/sync.ts's plain `err.message` capture actually distinguishes — see
 * staleness.ts's AUTH_FAILURE_PATTERN doc comment).
 *
 * `@vitest-environment node` mirrors cron-morning.test.ts's precedent for
 * Supabase-client-mocked tests; the fake query builder is the same
 * select/eq/order/limit/maybeSingle shape as that file's, trimmed to what
 * this module actually calls.
 */

const { getBrowserClientMock } = vi.hoisted(() => ({ getBrowserClientMock: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: getBrowserClientMock }));

type Row = { source: string; ok: boolean; detail: string | null; ran_at: string };

/**
 * Fake Supabase query builder covering exactly what staleness.ts's
 * `latestSyncRow` calls: `.from(table).select(...).eq(...).eq(...)?.order(...).limit(...).maybeSingle()`.
 * All rows for every source live in one flat array; `eq` filters are
 * accumulated and applied together, same as cron-morning.test.ts's
 * precedent (see that file's `makeQueryBuilder`).
 */
function fakeClient(allRows: Row[]) {
  return {
    from: (_table: string) => ({
      select: () => {
        const filters: Array<[string, unknown]> = [];
        let orderAsc = true;
        let limitN: number | undefined;
        const chain = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return chain;
          },
          order(_col: string, opts?: { ascending?: boolean }) {
            orderAsc = opts?.ascending ?? true;
            return chain;
          },
          limit(n: number) {
            limitN = n;
            return chain;
          },
          maybeSingle: () => {
            let rows = allRows.filter((r) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v));
            rows = [...rows].sort((a, b) => (a.ran_at < b.ran_at ? 1 : a.ran_at > b.ran_at ? -1 : 0) * (orderAsc ? -1 : 1));
            if (limitN !== undefined) rows = rows.slice(0, limitN);
            return Promise.resolve({ data: rows[0] ?? null, error: null });
          },
        };
        return chain;
      },
    }),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("getSyncStatus", () => {
  it("returns all-fresh for both sources without calling getBrowserClient when NEXT_PUBLIC_REPO_MODE is unset (local)", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "");
    const { getSyncStatus } = await import("@/lib/sync/staleness");

    const before = Date.now();
    const status = await getSyncStatus();
    const after = Date.now();

    expect(getBrowserClientMock).not.toHaveBeenCalled();
    for (const source of ["whoop", "strava"] as const) {
      expect(status[source].authBroken).toBe(false);
      expect(status[source].lastOkAt).not.toBeNull();
      const t = status[source].lastOkAt!.getTime();
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after);
    }
  });

  it("returns lastOkAt: null and authBroken: false for a source with no sync_runs rows at all", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "supabase");
    getBrowserClientMock.mockReturnValue(fakeClient([]));
    const { getSyncStatus } = await import("@/lib/sync/staleness");

    const status = await getSyncStatus();

    expect(status.whoop).toEqual({ lastOkAt: null, authBroken: false });
    expect(status.strava).toEqual({ lastOkAt: null, authBroken: false });
  });

  it("derives lastOkAt from the latest ok=true row, ignoring a later failed row", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "supabase");
    getBrowserClientMock.mockReturnValue(
      fakeClient([
        { source: "whoop", ok: true, detail: null, ran_at: "2026-07-11T08:00:00.000Z" },
        {
          source: "whoop",
          ok: false,
          detail: "Whoop API request failed: 500 Internal Server Error (/recovery)",
          ran_at: "2026-07-11T09:00:00.000Z",
        },
      ])
    );
    const { getSyncStatus } = await import("@/lib/sync/staleness");

    const status = await getSyncStatus();

    expect(status.whoop.lastOkAt).toEqual(new Date("2026-07-11T08:00:00.000Z"));
    // Latest row overall failed, but not with a 401 -> not authBroken.
    expect(status.whoop.authBroken).toBe(false);
  });

  it("flags authBroken when the single latest row failed with a 401 in its detail", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "supabase");
    getBrowserClientMock.mockReturnValue(
      fakeClient([
        { source: "whoop", ok: true, detail: null, ran_at: "2026-07-10T08:00:00.000Z" },
        {
          source: "whoop",
          ok: false,
          detail: "Whoop API request failed: 401 Unauthorized (/recovery)",
          ran_at: "2026-07-11T09:00:00.000Z",
        },
      ])
    );
    const { getSyncStatus } = await import("@/lib/sync/staleness");

    const status = await getSyncStatus();

    expect(status.whoop.authBroken).toBe(true);
    expect(status.whoop.lastOkAt).toEqual(new Date("2026-07-10T08:00:00.000Z"));
  });

  it("does not flag authBroken for the 'not connected' detail (never had tokens, not an auth break)", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "supabase");
    getBrowserClientMock.mockReturnValue(
      fakeClient([
        {
          source: "strava",
          ok: false,
          detail: "Strava is not connected for this user.",
          ran_at: "2026-07-11T09:00:00.000Z",
        },
      ])
    );
    const { getSyncStatus } = await import("@/lib/sync/staleness");

    const status = await getSyncStatus();

    expect(status.strava.authBroken).toBe(false);
    expect(status.strava.lastOkAt).toBeNull();
  });

  it("does not flag authBroken when the latest row succeeded", async () => {
    vi.stubEnv("NEXT_PUBLIC_REPO_MODE", "supabase");
    getBrowserClientMock.mockReturnValue(
      fakeClient([{ source: "whoop", ok: true, detail: null, ran_at: "2026-07-11T09:00:00.000Z" }])
    );
    const { getSyncStatus } = await import("@/lib/sync/staleness");

    const status = await getSyncStatus();

    expect(status.whoop.authBroken).toBe(false);
    expect(status.whoop.lastOkAt).toEqual(new Date("2026-07-11T09:00:00.000Z"));
  });
});
