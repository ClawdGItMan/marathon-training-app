import Link from "next/link";
import { LiveDot } from "@/components/ui/LiveDot";
import type { PlannedSession } from "@/lib/domain/types";

/**
 * Today's session as Instrument ruled rows (week-row pattern from design-v2
 * #7a): Space Grotesk name, quiet Geist detail, mono tag on the right.
 * While a proposal is open the original row is struck through with a PLANNED
 * tag and the proposed swap sits below it with a lime PROPOSED tag; once
 * decided, a single live row carries the pulsing dot + TODAY marker.
 * The whole block links to the workout detail.
 */
export function SessionRows({
  planned,
  proposed,
}: {
  planned: PlannedSession;
  proposed?: PlannedSession;
}) {
  const href = `/workout/${planned.id}`;

  if (proposed) {
    return (
      <Link href={href} className="block">
        <div className="hairline flex items-center gap-[13px] py-[13px]">
          <div className="flex-1">
            <div className="font-display text-[13.5px] text-[#6f757d] line-through decoration-white/30">
              {planned.title}
            </div>
            <div className="mt-[1px] font-num text-[10.5px] text-[#565b62]">
              {planned.detail}
            </div>
          </div>
          <span className="whitespace-nowrap font-mono text-[8.5px] tracking-[.14em] text-[#5c6168]">
            PLANNED
          </span>
        </div>
        <div className="flex items-center gap-[13px] py-[13px]">
          <div className="flex-1">
            <div className="font-display text-[13.5px] text-white">{proposed.title}</div>
            <div className="mt-[1px] font-num text-[10.5px] text-[#8a919c]">
              {proposed.detail}
            </div>
          </div>
          <span className="whitespace-nowrap font-mono text-[8.5px] tracking-[.14em] text-sig">
            PROPOSED
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="flex items-center gap-[13px] py-[13px]">
      <div className="flex-1">
        <div className="font-display text-[13.5px] text-white">{planned.title}</div>
        <div className="mt-[1px] font-num text-[10.5px] text-[#8a919c]">{planned.detail}</div>
      </div>
      <span className="flex items-center gap-[6px]">
        <LiveDot />
        <span className="font-mono text-[8.5px] tracking-[.14em] text-sig">TODAY</span>
      </span>
    </Link>
  );
}
