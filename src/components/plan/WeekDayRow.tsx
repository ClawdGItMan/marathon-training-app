import Link from "next/link";
import { TypeTag } from "@/components/ui/TypeTag";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatWeekDayLabel } from "@/lib/format";
import type { PlannedSession } from "@/lib/domain/types";

/**
 * Plan's THIS WEEK ruled day row (design-v2 #7a): mono weekday+date label
 * (lime for today), Space Grotesk title, quiet detail line, and either a
 * mono TypeTag or the pulsing TODAY marker on the right. Links to the
 * per-day workout detail (route lands in R9 — 404 until then is expected).
 * `hairline` follows the Section convention (SessionRows/GlanceLines): the
 * last row omits its own rule and lets the wrapping Section supply it.
 */
export function WeekDayRow({
  session,
  isToday,
  hairline = true,
}: {
  session: PlannedSession;
  isToday: boolean;
  hairline?: boolean;
}) {
  const { weekday, day } = formatWeekDayLabel(session.date);
  const isRest = session.type === "rest";

  return (
    <Link
      href={`/workout/${session.id}`}
      className={`flex items-center gap-[13px] py-[13px] ${hairline ? "hairline" : ""}`}
    >
      <span
        className={`w-8 flex-none whitespace-nowrap font-mono text-[9px] tracking-[.06em] ${
          isToday ? "text-sig" : "text-[#5c6168]"
        }`}
      >
        {weekday}
        <br />
        {day}
      </span>
      <div className="flex-1">
        <div
          className={`font-display text-[13.5px] ${
            isToday ? "text-white" : isRest ? "text-[#6f757d]" : "text-[#c3c8ce]"
          }`}
        >
          {session.title}
        </div>
        <div
          className={`mt-[1px] font-num text-[10.5px] ${
            isToday ? "text-[#8a919c]" : isRest ? "text-[#565b62]" : "text-[#6f757d]"
          }`}
        >
          {session.detail}
        </div>
      </div>
      {isToday ? (
        <span className="flex items-center gap-[6px]">
          <LiveDot />
          <span className="whitespace-nowrap font-mono text-[8.5px] tracking-[.14em] text-sig">
            TODAY
          </span>
        </span>
      ) : (
        <TypeTag type={session.type} dim={isRest} />
      )}
    </Link>
  );
}
