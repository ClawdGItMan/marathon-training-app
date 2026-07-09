import { LiveDot } from "@/components/ui/LiveDot";
import { StatGrid } from "@/components/ui/StatGrid";
import { categoryLabel, groupBreakdown } from "@/lib/workout";
import { parseEstMinutes } from "@/lib/format";
import type { PlannedSession } from "@/lib/domain/types";

/**
 * Workout Detail hero (design #6a, lines 579-587): pulsing lime dot + mono
 * category label, big Space Grotesk title, then a gap-only (no dividers)
 * stat row closed with a hairline.
 */
export function WorkoutHero({ session }: { session: PlannedSession }) {
  const blocks = session.structure ? groupBreakdown(session.structure).length : 0;

  return (
    <div className="px-[22px] pt-[26px]">
      <div className="flex items-center gap-[10px]">
        <LiveDot />
        <span className="whitespace-nowrap font-mono text-[10px] tracking-[.18em] text-[#9aa0a7]">
          {categoryLabel(session.type)}
        </span>
      </div>
      <div className="mt-3 font-display text-[34px] leading-[1.05] tracking-[-.02em] text-white">
        {session.title}
      </div>
      <div className="hairline mt-[18px] pb-[22px]">
        <StatGrid
          rule={false}
          items={[
            { label: "DISTANCE", value: session.distanceMi?.toString() ?? "—", unit: "mi" },
            { label: "TIME", value: parseEstMinutes(session.detail), unit: "min" },
            { label: "BLOCKS", value: blocks.toString() },
          ]}
        />
      </div>
    </div>
  );
}
