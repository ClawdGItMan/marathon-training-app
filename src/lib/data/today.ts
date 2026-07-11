import { seed } from "@/lib/data/seed";
import { localDayOf } from "@/lib/sync/timezone";
import type { PlannedSession } from "@/lib/domain/types";

/**
 * Date-based "today" resolution with a static-seed fallback (final-review
 * fix I2). Lives beside the repo seam because it's the read-model
 * counterpart to `repo.getWeekSessions()`: which of this week's sessions is
 * "today" for Log's RPE target, Plan's lime row (lime is strictly
 * "now/act/current"), and Today's session card.
 *
 * Resolution: the session whose `date` is `now`'s local calendar day in the
 * home timezone (p2-globals: all day-boundary math is home-tz-aware, never
 * `new Date()` locale defaults). When none matches — local mode's frozen
 * demo week (2026-06-29..07-05) on any live date — fall back to the seed's
 * static `todaySessionId`, which is exactly Phase 1's behavior, so
 * local-mode rendering (and the e2e baseline) is unchanged by construction.
 *
 * Timezone: defaults to the app's documented home-timezone default
 * (p2-globals / profiles.home_timezone's DDL default). Screens have no
 * profile read on their render path, and this single-tenant app's sole
 * profile keeps that default — threading a profiles round trip through
 * every screen for this would be over-engineering today; the parameter
 * exists so a future profile-aware caller can pass the real value.
 */
export const DEFAULT_HOME_TIMEZONE = "America/New_York";

export function resolveTodaySessionId(
  sessions: PlannedSession[],
  now: Date,
  tz: string = DEFAULT_HOME_TIMEZONE
): string {
  const today = localDayOf(now, tz);
  return sessions.find((session) => session.date === today)?.id ?? seed.todaySessionId;
}
