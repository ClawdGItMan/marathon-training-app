import { Section } from "@/components/ui/Section";
import { StatGrid } from "@/components/ui/StatGrid";
import { StaleMarker } from "@/components/sync/StaleMarker";
import { formatActivityTitle, formatMinSec, formatPace } from "@/lib/format";
import type { Activity } from "@/lib/domain/types";

/**
 * AUTO-IMPORTED · STRAVA card (design #7d): imported-run headline plus a
 * gap-only (StatGrid rule={false}) DISTANCE/TIME/AVG PACE row, matching the
 * #7d "THIS WEEK" gap-style stat row rather than the ruled 3-column grid.
 * No "SYNCED" badge — the brief explicitly bans it, even though
 * Activity.synced exists on the domain type for other future uses.
 */
export function ImportedRunSection({ activity }: { activity: Activity }) {
  return (
    <Section header={{ label: "AUTO-IMPORTED · STRAVA" }}>
      <StaleMarker sourceKey="strava" />
      <div className="mt-[10px] font-display text-[20px] text-white">
        {formatActivityTitle(activity.title)}
      </div>
      <div className="mt-[14px] pb-[18px]">
        <StatGrid
          rule={false}
          items={[
            { label: "DISTANCE", value: activity.distanceMi.toFixed(1), unit: "mi" },
            { label: "TIME", value: formatMinSec(activity.timeSec) },
            { label: "AVG PACE", value: formatPace(activity.paceSecPerMi), unit: "/mi" },
          ]}
        />
      </div>
    </Section>
  );
}
