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

/**
 * Extracts a message string from any thrown value: real Error instances,
 * plain string throws, and PostgREST's non-throwOnError error shape (a
 * plain `{ message, details, hint, code }` object that is NOT an Error
 * instance — see @supabase/postgrest-js's PostgrestBuilder, which returns
 * that shape for both server errors and network failures alike).
 */
function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "";
}

/**
 * Distinguishes genuine transport failures (offline, DNS down, request
 * aborted mid-flight) from server-returned errors that merely reached us
 * over a working connection.
 *
 * supabase-js/PostgREST throws `Error(error.message)`-shaped values straight
 * from PostgREST/RPC responses (see src/lib/data/supabase-repo.ts's
 * `if (error) throw error`) for things like RLS denials (42501, "permission
 * denied for table goals") and decide_proposal's business-rule raises
 * ("re-decide guard: proposal already expired") — those are SERVER
 * responses that arrived fine over the network and must NOT be treated as
 * offline/retryable. Only match:
 *  - `TypeError`, the shape the Fetch API itself throws for a failed
 *    request (Chrome: "Failed to fetch", Firefox: "NetworkError when
 *    attempting to fetch resource", Safari: "Load failed");
 *  - a message matching known network/transport failure text (also covers
 *    postgrest-js's non-throwOnError network-failure object, which is a
 *    plain object — not an Error/TypeError instance — whose `message` is
 *    built from the underlying fetch error, e.g. "TypeError: Failed to
 *    fetch");
 *  - or the browser reporting itself offline (`navigator.onLine === false`),
 *    regardless of the error shape.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return /failed to fetch|fetch failed|load failed|network|ECONNREFUSED|ETIMEDOUT|abort/i.test(errorMessage(err));
}

// `fallback` (Task 9) is additive and OMITTED (not `false`) on every normal
// entry — keeps the Task-5 shape backward compatible for existing
// `toEqual({ servedFromCache, cachedAt })` assertions, which would fail
// against an explicit `fallback: false` key that wasn't there before.
export type StaleEntry = { servedFromCache: boolean; cachedAt: string | null; fallback?: boolean };
export type StaleInfo = Record<string, StaleEntry>;

// Module-level so Task 12's markers can read it after any screen's fetch.
let staleInfo: StaleInfo = {};
export function getStaleInfo(): StaleInfo {
  return { ...staleInfo };
}
/** Test-only: reset module state between unit tests. */
export function __resetStaleInfoForTests(): void {
  staleInfo = {};
  fallbackFlags.clear();
}
function setStale(method: string, servedFromCache: boolean, cachedAt: string | null, fallback?: boolean): void {
  staleInfo = {
    ...staleInfo,
    [method]: fallback ? { servedFromCache, cachedAt, fallback: true } : { servedFromCache, cachedAt },
  };
}

// ---- pre-first-sync fallback marker (Task 9) --------------------------------
// supabaseRepo's getLatestRecovery/getRecovery7d fall back to seed values
// when `recovery_snapshots` has no rows yet for the user (so the app is
// never empty pre-first-sync — see supabase-repo.ts). Those methods call
// `markFallback(method)` DURING their live() call to flag "this value is a
// seed fallback, not real synced data"; `read()` below folds that into the
// method's staleInfo entry once live() resolves, then clears the flag
// (`finally`) so it never leaks into an unrelated later call for the same
// method name.
const fallbackFlags = new Set<string>();
export function markFallback(method: string): void {
  fallbackFlags.add(method);
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
 * live → write-through cache on success; on a genuine network failure,
 * serve the last-known cached value (Zod-revalidated), or a typed
 * OfflineError if there's no usable cache. Any other error (RLS denial,
 * "Unknown session", or any other server-returned rejection) is NOT a
 * connectivity problem — it rethrows untouched rather than silently
 * masking it behind stale cached data.
 */
async function read<T>(method: string, key: string, schema: z.ZodType<T>, live: () => Promise<T>): Promise<T> {
  fallbackFlags.delete(method); // discard any stale flag left by an unrelated earlier call
  try {
    const value = await live();
    writeCache(key, value);
    setStale(method, false, new Date().toISOString(), fallbackFlags.has(method));
    return value;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const cached = readCache(key, schema);
    if (!cached) throw new OfflineError(`${method}: network failure and no usable cached value`, { cause: err });
    setStale(method, true, cached.cachedAt);
    return cached.value;
  } finally {
    fallbackFlags.delete(method);
  }
}

/**
 * Writes are always live-only; never read from or written to the cache.
 * Only a genuine network failure is wrapped as OfflineError — a
 * business-rule rejection (e.g. decide_proposal's re-decide guard raising
 * "already expired") is a valid server response, not a dropped connection,
 * and must reach the caller as the original error, not something a future
 * error UI could misread as "retry when online".
 */
async function write<T>(method: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
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
