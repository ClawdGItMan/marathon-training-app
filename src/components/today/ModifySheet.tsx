"use client";

import { useState } from "react";
import { z } from "zod";
import type { PlannedSession } from "@/lib/domain/types";

const editSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  distanceMi: z.coerce.number().positive("Distance must be a positive number."),
  paceTarget: z.string().trim().optional(),
});

const labelClass =
  "mt-[14px] block font-mono text-[9px] uppercase tracking-[.14em] text-[#5c6168]";
const inputClass =
  "mt-[6px] w-full rounded-[2px] bg-transparent px-3 py-[10px] font-num text-[14px] text-white outline-none";
const inputBorder = { border: "1px solid var(--hair)" };

/**
 * Modify sheet restyled to Instrument: flat #0B0C0E hairline box, mono
 * micro-labels, 50px lime SAVE CTA (global pattern), mono ghost CANCEL.
 * Behavior unchanged: Zod-validated edit, save hands the edited session up.
 */
export function ModifySheet({
  session,
  onSave,
  onCancel,
}: {
  session: PlannedSession;
  onSave: (edited: PlannedSession) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(session.title);
  const [distanceMi, setDistanceMi] = useState(String(session.distanceMi ?? ""));
  const [paceTarget, setPaceTarget] = useState(session.paceTarget ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const parsed = editSchema.safeParse({ title, distanceMi, paceTarget });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    setError(null);
    onSave({
      ...session,
      title: parsed.data.title,
      distanceMi: parsed.data.distanceMi,
      paceTarget: parsed.data.paceTarget || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div
        className="w-full max-w-[414px] rounded-[2px] bg-[#0B0C0E] p-[18px] pb-[26px]"
        style={inputBorder}
      >
        <span className="font-mono text-[9.5px] uppercase tracking-[.18em] text-sig">
          MODIFY SESSION
        </span>

        <label htmlFor="modify-title" className={labelClass}>
          TITLE
        </label>
        <input
          id="modify-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          style={inputBorder}
        />

        <label htmlFor="modify-distance" className={labelClass}>
          DISTANCE (MI)
        </label>
        <input
          id="modify-distance"
          value={distanceMi}
          onChange={(e) => setDistanceMi(e.target.value)}
          inputMode="decimal"
          className={inputClass}
          style={inputBorder}
        />

        <label htmlFor="modify-pace" className={labelClass}>
          PACE TARGET
        </label>
        <input
          id="modify-pace"
          value={paceTarget}
          onChange={(e) => setPaceTarget(e.target.value)}
          className={inputClass}
          style={inputBorder}
        />

        {error ? (
          <div className="mt-[10px] font-num text-[11px] text-[#e8eaec]">{error}</div>
        ) : null}

        <div className="mt-4 flex items-center gap-[14px]">
          <button
            onClick={handleSave}
            className="h-[50px] flex-1 rounded-[2px] bg-sig font-display text-[13px] font-semibold uppercase tracking-[.06em] text-[#0B0C0E]"
          >
            SAVE
          </button>
          <button
            onClick={onCancel}
            className="h-[50px] px-4 font-mono text-[11px] tracking-[.1em] text-[#7b828c]"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
