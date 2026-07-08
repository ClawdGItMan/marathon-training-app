"use client";

import { useEffect, useState } from "react";
import { formatRaceDateLong } from "@/lib/format";
import type { RaceGoal } from "@/lib/domain/types";

/**
 * PROFILE rows (Settings, R12 — no v2 mock): RACE (from seed's goal — R12
 * brief calls this out explicitly, it's real domain data) and TIMEZONE.
 * There's no timezone field anywhere in the schema/seed, and the brief says
 * not to invent new domain schema for this screen — timezone is a device
 * setting, not training data, so it's read from the browser's own resolved
 * `Intl` timezone instead. That value only exists client-side (and can
 * legitimately differ between the server's render and the browser's), so it
 * starts blank and fills in on mount rather than being read during render —
 * the same reasoning React docs give for clock/timezone text that must
 * differ between server and client.
 */
export function ProfileSection({ goal }: { goal: RaceGoal }) {
  const [timezone, setTimezone] = useState<string | null>(null);

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return (
    <div>
      {/* border-t (not a per-row closing hairline) between rows, like
          PredictionsCard's ruled rows — the last row leans on Section's own
          closing hairline instead of doubling up on the same edge. */}
      <div className="flex items-center justify-between py-[13px]">
        <span className="whitespace-nowrap font-mono text-[9px] tracking-[.14em] text-[#5c6168]">
          RACE
        </span>
        <span className="font-num text-[11px] text-[#e8eaec]">
          {goal.name} · {formatRaceDateLong(goal.date)}
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-white/[.09] py-[13px]">
        <span className="whitespace-nowrap font-mono text-[9px] tracking-[.14em] text-[#5c6168]">
          TIMEZONE
        </span>
        <span className="font-num text-[11px] text-[#e8eaec]">{timezone ?? "—"}</span>
      </div>
    </div>
  );
}
