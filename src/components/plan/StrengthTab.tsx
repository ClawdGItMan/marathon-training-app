"use client";

import { useState } from "react";
import { Section } from "@/components/ui/Section";
import { CornerTickBox } from "@/components/ui/CornerTickBox";
import { PhaseTracker } from "@/components/plan/PhaseTracker";
import { ExerciseRow } from "@/components/plan/ExerciseRow";
import { ExerciseDetailSheet } from "@/components/plan/ExerciseDetailSheet";
import type { StrengthExercise } from "@/lib/domain/types";
import type { StrengthSession } from "@/lib/data/repo";

/**
 * Plan's STRENGTH tab (design-v2 #7e): phase label + headline + phase
 * tracker, WEDNESDAY · LOWER checklist, and a corner-tick COACH note.
 * Checklist toggles and the open detail sheet are local component state —
 * see task report for why this doesn't route through the repo overlay yet.
 */
export function StrengthTab({ strength }: { strength: StrengthSession }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<StrengthExercise | null>(null);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      <div className="px-[22px] pt-[18px]">
        <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[.16em] text-sig">
          {strength.phase}
        </span>
        <div className="mt-2 font-display text-[16px] leading-[1.35] text-white">
          {strength.note}
        </div>
        <PhaseTracker currentIndex={strength.phaseIndex} />
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section header={{ label: "WEDNESDAY · LOWER", context: "~35 MIN" }}>
          {strength.session.map((exercise, i) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              checked={!!checked[exercise.id]}
              hairline={i < strength.session.length - 1}
              onToggle={() => toggle(exercise.id)}
              onOpenDetail={() => setSelected(exercise)}
            />
          ))}
        </Section>
      </div>

      <div className="mt-1 px-[22px]">
        <CornerTickBox label="COACH">
          <div className="mt-[6px] font-num text-[11.5px] leading-[1.55] text-[#8a919c]">
            {strength.coachNote}
          </div>
        </CornerTickBox>
      </div>

      {selected ? (
        <ExerciseDetailSheet exercise={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
