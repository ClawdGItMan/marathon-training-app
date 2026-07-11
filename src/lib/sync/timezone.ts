/**
 * Local-day attribution helper (Task 8; reused by Task 9's cron/day-boundary
 * math per p2-globals.md's "Home timezone" constraint — never `new Date()`
 * locale defaults). Built on `Intl.DateTimeFormat` with an explicit
 * `timeZone`, no new dependency.
 *
 * Uses `formatToParts` rather than trusting `.format()`'s string output:
 * only the individual *parts* (year/month/day field values) are guaranteed
 * by ECMA-402 for a given locale+options — the separator/ordering of the
 * formatted string is an implementation/CLDR-data detail that can vary
 * across Node/ICU versions, so extracting fields directly and assembling
 * `YYYY-MM-DD` ourselves is the robust approach.
 */
export function localDayOf(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Local-hour helper (Task 9): the tz-aware wall-clock hour (0-23) `now`
 * lands on in `tz`. This is the DST-survival mechanism for the morning
 * cron — `src/app/api/cron/morning/route.ts` runs hourly on a fixed UTC
 * schedule and no-ops unless `localHourOf(now, profile.home_timezone) ===
 * 6`, so the wall-clock trigger stays pinned to 6am local regardless of
 * DST shifting the UTC offset underneath it. Same `formatToParts` technique
 * as `localDayOf` above, for the same reason (don't trust `.format()`'s
 * string layout). `hourCycle: "h23"` forces a plain 00-23 range (midnight
 * is "00", never "24"), so there's no am/pm or 24-vs-00 ambiguity to handle
 * before converting to a number.
 */
export function localHourOf(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  return Number(hour);
}
