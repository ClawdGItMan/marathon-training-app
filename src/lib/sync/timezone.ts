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
