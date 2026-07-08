"use client";

import { Section } from "@/components/ui/Section";
import { SegmentMeter } from "@/components/ui/SegmentMeter";

type PainOption = { id: string | null; label: string };

// ACHILLES · L maps to the real seed.pains area ("achilles-l"). ACHILLES · R
// and OTHER have no corresponding seed.pains entry (seed only tracks
// achilles-l/calf-r) — selecting them still records a pain id via logRun,
// but it won't surface on Body's PAIN & INJURIES list. See R10 report.
const PAIN_OPTIONS: PainOption[] = [
  { id: "achilles-l", label: "ACHILLES · L" },
  { id: "achilles-r", label: "ACHILLES · R" },
  { id: "other", label: "OTHER" },
  { id: null, label: "NONE" },
];

function chipClass(selected: boolean): string {
  return selected
    ? "flex-none whitespace-nowrap rounded-[2px] border border-sig bg-[rgba(201,245,63,.08)] px-[13px] py-[9px] font-mono text-[9.5px] tracking-[.1em] text-sig"
    : "flex-none whitespace-nowrap rounded-[2px] border border-[var(--hair)] px-[13px] py-[9px] font-mono text-[9.5px] tracking-[.1em] text-[#8a919c]";
}

/**
 * ANY PAIN? chip toggles + SEVERITY meter (design #7d). SEVERITY and the
 * reassurance line only render once a pain area is selected — the mock
 * shows a single state (ACHILLES · L selected); hiding severity for NONE is
 * a reasonable inference beyond that one frame, not literally in the HTML.
 */
export function PainSection({
  selectedPain,
  severity,
  onSelectPain,
  onSeverityChange,
}: {
  selectedPain: string | null;
  severity: number;
  onSelectPain: (id: string | null) => void;
  onSeverityChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[.18em] text-[#9aa0a7]">
        ANY PAIN?
      </div>
      <div className="mt-3 flex gap-2">
        {PAIN_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={selectedPain === option.id}
            onClick={() => onSelectPain(option.id)}
            className={chipClass(selectedPain === option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {selectedPain ? (
        <>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="whitespace-nowrap font-mono text-[9px] tracking-[.14em] text-[#5c6168]">
              SEVERITY
            </span>
            <span className="font-num text-[10px] text-white">
              {severity} <span className="text-[#5c6168]">/ 10</span>
            </span>
          </div>
          <Section className="mt-[9px] pb-[18px]">
            <SegmentMeter
              value={severity}
              onChange={onSeverityChange}
              height={8}
              color="#fff"
              ariaLabel="Severity"
            />
          </Section>
          <div className="mt-3 font-num text-[10.5px] leading-[1.5] text-[#6f757d]">
            Mild is fine to train through — we&apos;ll keep watching the trend.
          </div>
        </>
      ) : null}
    </div>
  );
}
