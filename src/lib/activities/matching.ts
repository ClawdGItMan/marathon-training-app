import type { PlannedSession, SessionType } from "@/lib/domain/types";

/**
 * Session-matching rules (Task 11, spec §6 verbatim): an imported run
 * matches a planned session iff same local day + session is a run type +
 * not already completed; closest planned distance wins; ties break by
 * priority order [speed, tempo, long, easy].
 *
 * Deliberately pure and tz-agnostic: the brief's pseudocode signature is
 * `matchSession(activity, sessions)` with no explicit timezone parameter,
 * but "same local day (home tz)" genuinely needs one. Rather than importing
 * `localDayOf`/threading a `tz` string through this module, the caller
 * (src/lib/integrations/strava/sync.ts) precomputes the activity's home-tz
 * local day once via `localDayOf` and passes it in as
 * `MatchableActivity.localDay` — keeping this module a plain, trivially
 * unit-testable pure function with no Date/Intl logic of its own.
 */

export type MatchableActivity = {
  /** Local calendar day (home timezone) the activity started on, "YYYY-MM-DD". */
  localDay: string;
  distanceMi: number;
};

/**
 * The real `sessionTypeSchema` union (src/lib/domain/schemas.ts) is
 * `easy|speed|tempo|long|rest|strength|recovery` — the brief's prose names
 * `easy|tempo|speed|long|intervals`, which doesn't match verbatim (no
 * "intervals" type exists; "rest"/"strength"/"recovery" aren't mentioned).
 * Read against the real union: "rest" is a no-run day, "strength" is a gym
 * day, and "recovery" is unused as a top-level session type anywhere in the
 * current seed data (it only appears as a `StructureSegment.kind`, i.e. the
 * jog between speed reps) — its whole-session semantics are undefined, so
 * it's excluded rather than guessed at. The four types below are exactly
 * the brief's explicit list intersected with the real schema union.
 */
export const RUN_SESSION_TYPES: ReadonlySet<SessionType> = new Set(["easy", "tempo", "speed", "long"]);

/** Tie-break order when two candidates have an identical distance diff — first wins. */
const TIE_PRIORITY: SessionType[] = ["speed", "tempo", "long", "easy"];

function isRunType(type: SessionType): boolean {
  return RUN_SESSION_TYPES.has(type);
}

/**
 * Picks the single best-matching planned session for `activity`, or `null`
 * if none qualifies. Candidates are filtered to same local day + run type +
 * not-completed; the closest `|distanceMi diff|` wins, with an explicit
 * priority-order comparison (not "first in array wins") on an exact tie so
 * the result is independent of `sessions`' iteration order.
 */
export function matchSession(activity: MatchableActivity, sessions: PlannedSession[]): PlannedSession | null {
  const candidates = sessions.filter(
    (s) => s.date === activity.localDay && isRunType(s.type) && s.status !== "completed"
  );

  let best: PlannedSession | null = null;
  let bestDiff = Infinity;

  for (const candidate of candidates) {
    const candidateDistance = candidate.distanceMi ?? Infinity;
    const diff = Math.abs(candidateDistance - activity.distanceMi);

    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
      continue;
    }

    if (diff === bestDiff && best) {
      const candidatePriority = TIE_PRIORITY.indexOf(candidate.type);
      const bestPriority = TIE_PRIORITY.indexOf(best.type);
      if (candidatePriority !== -1 && (bestPriority === -1 || candidatePriority < bestPriority)) {
        best = candidate;
      }
    }
  }

  return best;
}
