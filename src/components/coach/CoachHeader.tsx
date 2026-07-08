import Link from "next/link";
import { LiveDot } from "@/components/ui/LiveDot";

/**
 * Coach's own header (design #7f, lines 475-483) — deliberately not
 * `PageHeader`: BACK is a literal label (unlike Workout Detail's dynamic
 * origin label) since the mock always renders the word "BACK", and there's
 * no ASK COACH chip (Coach doesn't link to itself). The "HAS TODAY'S
 * CONTEXT" pulsing dot reuses the shared `LiveDot` (design's 3.2s lime
 * pulse, already used for Today's live indicator).
 */
export function CoachHeader({
  backHref,
  dateContext,
}: {
  backHref: string;
  dateContext: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-[22px] pt-[10px]">
        <Link href={backHref} className="flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9aa0a7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span className="font-mono text-[10px] tracking-[.14em] text-[#9aa0a7]">BACK</span>
        </Link>
        <span className="whitespace-nowrap font-mono text-[10px] tracking-[.14em] text-[#5c6168]">
          {dateContext}
        </span>
      </div>

      <div className="hairline flex items-end justify-between px-[22px] pt-[14px] pb-[18px]">
        <div className="font-display text-[30px] leading-none tracking-[-.02em] text-white">
          Coach
        </div>
        <span className="flex items-center gap-[6px] pb-[3px]">
          <LiveDot />
          <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[.14em] text-[#9aa0a7]">
            HAS TODAY&apos;S CONTEXT
          </span>
        </span>
      </div>
    </>
  );
}
