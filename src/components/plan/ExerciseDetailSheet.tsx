"use client";

import type { StrengthExercise } from "@/lib/domain/types";

/**
 * Generic dark Instrument-styled fallback illustration. Real per-exercise
 * illustrations land later (spec §8, user-supplied art keyed by slug) —
 * this is a static placeholder only: no image generation, no network
 * assets.
 */
function FallbackIllustration() {
  return (
    <div
      className="flex aspect-square w-full items-center justify-center rounded-[2px]"
      style={{ border: "1px solid var(--hair)", background: "#11151b" }}
    >
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="#3f444b" strokeWidth="1.5" />
        <path d="M8 12h8M12 8v8" stroke="#3f444b" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/**
 * Exercise detail sheet (design-v2 #7e row → detail, per spec §8): opened
 * by tapping a strength checklist row. Same fixed bottom-sheet mechanics as
 * ModifySheet (src/components/today/ModifySheet.tsx).
 */
export function ExerciseDetailSheet({
  exercise,
  onClose,
}: {
  exercise: StrengthExercise;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div
        className="w-full max-w-[414px] rounded-[2px] bg-[#0B0C0E] p-[18px] pb-[26px]"
        style={{ border: "1px solid var(--hair)" }}
      >
        <FallbackIllustration />
        <div className="mt-4 font-display text-[18px] text-white">{exercise.name}</div>
        <div className="mt-1 font-mono text-[12px] text-[#9aa0a7]">
          {exercise.sets}×{exercise.reps}
        </div>
        <div className="mt-2 font-num text-[12px] leading-[1.5] text-[#8a919c]">{exercise.cue}</div>
        {exercise.muscles.length ? (
          <div className="mt-[10px] font-mono text-[9px] uppercase tracking-[.12em] text-[#5c6168]">
            {exercise.muscles.join(" · ")}
          </div>
        ) : null}
        <button
          onClick={onClose}
          className="mt-5 h-[50px] w-full rounded-[2px] font-mono text-[11px] tracking-[.1em] text-[#7b828c]"
          style={{ border: "1px solid var(--hair)" }}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
