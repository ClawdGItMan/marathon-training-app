import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Repo } from "@/lib/data/repo";
import type { RaceGoal, PlannedSession } from "@/lib/domain/types";
import { getStaleInfo, OfflineError, withOfflineCache, __resetStaleInfoForTests } from "@/lib/data/offline-cache";

const GOAL: RaceGoal = {
  name: "City Marathon",
  date: "2026-10-04",
  goalSec: 12600,
  predictedSec: 12800,
  daysOut: 88,
  streak: 12,
};

const SESSION: PlannedSession = {
  id: "sat-long",
  date: "2026-07-11",
  type: "long",
  title: "Long run",
  detail: "Easy long run",
  status: "planned",
  provenance: "original",
};

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    getGoal: vi.fn(async () => GOAL),
    getBlock: vi.fn(),
    getLatestRecovery: vi.fn(),
    getRecovery7d: vi.fn(),
    getWeekSessions: vi.fn(),
    getSession: vi.fn(async () => SESSION),
    startSession: vi.fn(async () => undefined),
    getOpenProposals: vi.fn(),
    decideProposal: vi.fn(async () => undefined),
    getPains: vi.fn(),
    logPain: vi.fn(async () => undefined),
    getPredictions: vi.fn(),
    getStrengthSession: vi.fn(),
    getCoachThread: vi.fn(),
    appendChat: vi.fn(async () => undefined),
    logRun: vi.fn(async () => undefined),
    ...overrides,
  } as Repo;
}

describe("withOfflineCache", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetStaleInfoForTests();
  });

  it("writes through to localStorage on a successful read", async () => {
    const live = makeRepo();
    const cached = withOfflineCache(live);

    const result = await cached.getGoal();

    expect(result).toEqual(GOAL);
    expect(live.getGoal).toHaveBeenCalledTimes(1);
    const raw = localStorage.getItem("marathon.phase2.cache.getGoal");
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope.value).toEqual(GOAL);
    expect(typeof envelope.cachedAt).toBe("string");

    const info = getStaleInfo();
    expect(info.getGoal).toEqual({ servedFromCache: false, cachedAt: expect.any(String) });
  });

  it("serves the cached value when the live call fails", async () => {
    const getGoal = vi.fn().mockResolvedValueOnce(GOAL).mockRejectedValueOnce(new Error("network down"));
    const live = makeRepo({ getGoal });
    const cached = withOfflineCache(live);

    await cached.getGoal(); // primes the cache
    const result = await cached.getGoal(); // live call fails this time

    expect(result).toEqual(GOAL);
    expect(getGoal).toHaveBeenCalledTimes(2);

    const info = getStaleInfo();
    expect(info.getGoal?.servedFromCache).toBe(true);
    expect(info.getGoal?.cachedAt).toEqual(expect.any(String));
  });

  it("drops a corrupt cache entry and rethrows when the live call also fails", async () => {
    localStorage.setItem("marathon.phase2.cache.getGoal", "not json at all {{{");
    const getGoal = vi.fn().mockRejectedValue(new Error("network down"));
    const live = makeRepo({ getGoal });
    const cached = withOfflineCache(live);

    await expect(cached.getGoal()).rejects.toBeInstanceOf(OfflineError);
    expect(localStorage.getItem("marathon.phase2.cache.getGoal")).toBeNull();
  });

  it("drops a cache entry that fails schema validation", async () => {
    localStorage.setItem(
      "marathon.phase2.cache.getGoal",
      JSON.stringify({ value: { name: 42 }, cachedAt: new Date().toISOString() })
    );
    const getGoal = vi.fn().mockRejectedValue(new Error("network down"));
    const live = makeRepo({ getGoal });
    const cached = withOfflineCache(live);

    await expect(cached.getGoal()).rejects.toBeInstanceOf(OfflineError);
    expect(localStorage.getItem("marathon.phase2.cache.getGoal")).toBeNull();
  });

  it("throws typed OfflineError when cold (no cache) and offline", async () => {
    const getGoal = vi.fn().mockRejectedValue(new Error("network down"));
    const live = makeRepo({ getGoal });
    const cached = withOfflineCache(live);

    await expect(cached.getGoal()).rejects.toBeInstanceOf(OfflineError);
  });

  it("keys getSession's cache per-id so different sessions don't collide", async () => {
    const live = makeRepo();
    const cached = withOfflineCache(live);

    await cached.getSession("sat-long");

    expect(localStorage.getItem("marathon.phase2.cache.getSession.sat-long")).not.toBeNull();
  });

  it("never caches writes, and throws typed OfflineError on write failure", async () => {
    const logRun = vi.fn().mockRejectedValue(new Error("network down"));
    const live = makeRepo({ logRun });
    const cached = withOfflineCache(live);

    await expect(cached.logRun({ rpe: 5 })).rejects.toBeInstanceOf(OfflineError);
    expect(Object.keys(localStorage).some((k) => k.includes("logRun"))).toBe(false);

    // Successful writes also never write to the cache namespace.
    const okLive = makeRepo();
    const okCached = withOfflineCache(okLive);
    await okCached.logRun({ rpe: 5 });
    expect(
      Object.keys(localStorage).filter((k) => k.startsWith("marathon.phase2.cache.")).length
    ).toBe(0);
  });
});
