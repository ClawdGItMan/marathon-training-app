"use client";

import { useEffect, useState } from "react";
import { getSyncStatus, STALE_ACTIVITIES_MS, STALE_RECOVERY_MS, type SyncSource } from "@/lib/sync/staleness";

/**
 * One mono status line, rendered ONLY when `sourceKey`'s data is stale
 * (Task 12 / p2-globals.md's "screens change zero pixels except the new
 * marker line"). Text and styling are the brief's exact Instrument idiom —
 * the SAME mono-10px/.18em type scale as SectionHeader's label (see
 * src/components/ui/SectionHeader.tsx), but in the dimmer #5c6168 context
 * color rather than the label's #9aa0a7, since this is a secondary status
 * line, not a section title. No icon, no new color, no new pattern.
 *
 * Threshold is derived from `sourceKey` per p2-globals.md's staleness
 * thresholds: "whoop" (recovery-derived screens — Body, Today's readiness
 * hero) uses STALE_RECOVERY_MS (3h); "strava" (activity-derived screens —
 * Log's imported-run section) uses STALE_ACTIVITIES_MS (1h).
 *
 * Renders nothing (a) while the async getSyncStatus() call is in flight,
 * (b) when the source has never had a successful sync (`lastOkAt: null` —
 * there's no "last synced" instant to report, and the brief's text format
 * has no clause for that case), and (c) in local mode, where
 * getSyncStatus() resolves `lastOkAt: <now>` for every source (see
 * staleness.ts's doc comment) — so local mode is provably hidden by the
 * same "not yet past threshold" arithmetic every other fresh case uses,
 * not a separate branch here.
 */
export function StaleMarker({ sourceKey }: { sourceKey: SyncSource }) {
  const [hoursStale, setHoursStale] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSyncStatus()
      .then((status) => {
        if (cancelled) return;

        const { lastOkAt } = status[sourceKey];
        if (!lastOkAt) {
          setHoursStale(null);
          return;
        }

        const thresholdMs = sourceKey === "whoop" ? STALE_RECOVERY_MS : STALE_ACTIVITIES_MS;
        const elapsedMs = Date.now() - lastOkAt.getTime();
        setHoursStale(elapsedMs > thresholdMs ? Math.floor(elapsedMs / 3_600_000) : null);
      })
      .catch((err) => {
        // Fail-open ON PURPOSE (fix loop 1): a transient sync_runs query
        // failure must not fake a STALE alarm, so state stays at its
        // initial null (no marker). Handled explicitly rather than left as
        // an unhandled rejection; there's no error-UI idiom to render into.
        console.warn("StaleMarker: getSyncStatus failed; rendering no marker (fail-open)", err);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  if (hoursStale === null) return null;

  return (
    <div className="mt-[8px] font-mono text-[10px] tracking-[.18em] text-[#5c6168]">
      STALE — LAST SYNCED {hoursStale}H AGO
    </div>
  );
}
