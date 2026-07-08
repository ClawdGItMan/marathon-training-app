"use client";

import { Section } from "@/components/ui/Section";
import { SegmentMeter } from "@/components/ui/SegmentMeter";

/**
 * HOW HARD? · RPE section (design #7d): interactive 10-segment lime meter,
 * tap a segment to set 1–10. The right-hand "N / 10" readout is two-tone
 * (white numeral, grey "/10"), so it can't reuse SectionHeader's
 * single-color context slot — built directly here instead.
 */
export function RpeSection({
  rpe,
  onChange,
}: {
  rpe: number;
  onChange: (value: number) => void;
}) {
  return (
    <Section className="pb-[16px]">
      <div className="flex items-baseline justify-between">
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[.18em] text-[#9aa0a7]">
          HOW HARD? · RPE
        </span>
        <span className="font-num text-[10px] text-white">
          {rpe} <span className="text-[#5c6168]">/ 10</span>
        </span>
      </div>
      <div className="mt-3">
        <SegmentMeter value={rpe} onChange={onChange} ariaLabel="RPE" />
      </div>
      <div className="mt-[7px] flex justify-between whitespace-nowrap font-mono text-[8px] tracking-[.1em] text-[#5c6168]">
        <span>EASY</span>
        <span>ALL-OUT</span>
      </div>
    </Section>
  );
}
