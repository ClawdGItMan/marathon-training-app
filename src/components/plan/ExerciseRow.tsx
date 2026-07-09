"use client";

import type { StrengthExercise } from "@/lib/domain/types";

function CheckRing({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-4 w-4 flex-none items-center justify-center rounded-full"
      style={{
        border: `1.5px solid ${checked ? "var(--color-sig)" : "#3f444b"}`,
        background: checked ? "var(--color-sig)" : "transparent",
      }}
    >
      {checked ? (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 12l5 5 11-11" stroke="#0B0C0E" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * Strength checklist row (design-v2 #7e, ~lines 420-444): thin-ring
 * checkbox toggles local completion state (see task report — Phase 1 keeps
 * this in component state rather than the repo overlay); the name/cue area
 * opens the exercise detail sheet; mono sets×reps sits on the right.
 * `hairline` follows the Section-composition convention — see WeekDayRow.
 */
export function ExerciseRow({
  exercise,
  checked,
  hairline = true,
  onToggle,
  onOpenDetail,
}: {
  exercise: StrengthExercise;
  checked: boolean;
  hairline?: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <div className={`flex items-center gap-[13px] py-[14px] ${hairline ? "hairline" : ""}`}>
      <button
        type="button"
        aria-pressed={checked}
        aria-label={`Toggle complete: ${exercise.name}`}
        onClick={onToggle}
      >
        <CheckRing checked={checked} />
      </button>
      <button
        type="button"
        aria-label={`Exercise detail: ${exercise.name}`}
        onClick={onOpenDetail}
        className="flex-1 text-left"
      >
        <div className="font-display text-[13.5px] text-[#e8eaec]">{exercise.name}</div>
        <div className="mt-[1px] font-num text-[10.5px] text-[#6f757d]">{exercise.cue}</div>
      </button>
      <span className="whitespace-nowrap font-mono text-[12px] text-[#9aa0a7]">
        {exercise.sets}×{exercise.reps}
      </span>
    </div>
  );
}
