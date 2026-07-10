import { z } from "zod";
import type { Repo, StrengthSession } from "@/lib/data/repo";
import {
  raceGoalSchema,
  trainingBlockSchema,
  recoverySchema,
  sessionSchema,
  proposalSchema,
  painAreaSchema,
  predictionSchema,
  chatMessageSchema,
  strengthExerciseSchema,
} from "@/lib/domain/schemas";

const CACHE_PREFIX = "marathon.phase2.cache.";

/**
 * Typed error for read-cold-and-offline and any write failure. Screens
 * currently have no explicit rejection handling (see task-5-report.md) —
 * this gives a stable error identity for whenever that handling is added.
 */
export class OfflineError extends Error {
  cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "OfflineError";
    this.cause = options?.cause;
  }
}

export type StaleEntry = { servedFromCache: boolean; cachedAt: string | null };
export type StaleInfo = Record<string, StaleEntry>;

// Module-level so Task 12's markers can read it after any screen's fetch.
let staleInfo: StaleInfo = {};
export function getStaleInfo(): StaleInfo {
  return { ...staleInfo };
}
/** Test-only: reset module state between unit tests. */
export function __resetStaleInfoForTests(): void {
  staleInfo = {};
}
function setStale(method: string, servedFromCache: boolean, cachedAt: string | null): void {
  staleInfo = { ...staleInfo, [method]: { servedFromCache, cachedAt } };
}

type Envelope<T> = { value: T; cachedAt: string };

function readCache<T>(key: string, schema: z.ZodType<T>): Envelope<T> | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { value: unknown; cachedAt: unknown };
    return { value: schema.parse(parsed.value), cachedAt: z.string().parse(parsed.cachedAt) };
  } catch {
    // Corrupt JSON or schema mismatch — drop rather than serve bad data.
    localStorage.removeItem(key);
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify({ value, cachedAt: new Date().toISOString() }));
}

/**
 * live → write-through cache on success; on live failure, serve the
 * last-known cached value (Zod-revalidated); with no usable cache, rethrow
 * as a typed OfflineError.
 */
async function read<T>(method: string, key: string, schema: z.ZodType<T>, live: () => Promise<T>): Promise<T> {
  try {
    const value = await live();
    writeCache(key, value);
    setStale(method, false, new Date().toISOString());
    return value;
  } catch (err) {
    const cached = readCache(key, schema);
    if (!cached) throw new OfflineError(`${method}: network failure and no usable cached value`, { cause: err });
    setStale(method, true, cached.cachedAt);
    return cached.value;
  }
}

/** Writes are always live-only; never read from or written to the cache. */
async function write<T>(method: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new OfflineError(`${method}: write failed`, { cause: err });
  }
}

// getStrengthSession has no dedicated schema in schemas.ts (still
// seed-derived per supabase-repo.ts) — composed here next to Repo's
// StrengthSession type.
const strengthSessionSchema: z.ZodType<StrengthSession> = z.object({
  phase: z.string(),
  note: z.string(),
  phaseIndex: z.number(),
  coachNote: z.string(),
  session: z.array(strengthExerciseSchema),
});

const key = (method: string) => `${CACHE_PREFIX}${method}`;

/**
 * Wraps a Repo so every read is offline-cache-backed and every write is
 * live-only. Intended to wrap `supabaseRepo` only — `localRepo` already
 * persists to localStorage on its own terms.
 */
export function withOfflineCache(repo: Repo): Repo {
  return {
    getGoal: () => read("getGoal", key("getGoal"), raceGoalSchema, () => repo.getGoal()),
    getBlock: () => read("getBlock", key("getBlock"), trainingBlockSchema, () => repo.getBlock()),
    getLatestRecovery: () =>
      read("getLatestRecovery", key("getLatestRecovery"), recoverySchema, () => repo.getLatestRecovery()),
    getRecovery7d: () =>
      read("getRecovery7d", key("getRecovery7d"), z.array(recoverySchema), () => repo.getRecovery7d()),
    getWeekSessions: () =>
      read("getWeekSessions", key("getWeekSessions"), z.array(sessionSchema), () => repo.getWeekSessions()),
    getSession: (id) => read("getSession", `${key("getSession")}.${id}`, sessionSchema, () => repo.getSession(id)),
    startSession: (id) => write("startSession", () => repo.startSession(id)),
    getOpenProposals: () =>
      read("getOpenProposals", key("getOpenProposals"), z.array(proposalSchema), () => repo.getOpenProposals()),
    decideProposal: (id, decision, edited) =>
      write("decideProposal", () => repo.decideProposal(id, decision, edited)),
    getPains: () => read("getPains", key("getPains"), z.array(painAreaSchema), () => repo.getPains()),
    logPain: (areaId, severity, note) => write("logPain", () => repo.logPain(areaId, severity, note)),
    getPredictions: () =>
      read("getPredictions", key("getPredictions"), z.array(predictionSchema), () => repo.getPredictions()),
    getStrengthSession: () =>
      read("getStrengthSession", key("getStrengthSession"), strengthSessionSchema, () => repo.getStrengthSession()),
    getCoachThread: () =>
      read("getCoachThread", key("getCoachThread"), z.array(chatMessageSchema), () => repo.getCoachThread()),
    appendChat: (msg) => write("appendChat", () => repo.appendChat(msg)),
    logRun: (entry) => write("logRun", () => repo.logRun(entry)),
  };
}
