"use client";

import { useState } from "react";
import { z } from "zod";
import type { PlannedSession } from "@/lib/domain/types";

const editSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  distanceMi: z.coerce.number().positive("Distance must be a positive number."),
  paceTarget: z.string().trim().optional(),
});

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-[414px] rounded-t-[16px] border border-white/[.05] bg-[#171c23] p-[18px] pb-[26px]">
        <div className="font-ui text-[15px] font-bold text-white">Modify session</div>

        <label
          htmlFor="modify-title"
          className="mt-[14px] block font-ui text-[10px] font-bold tracking-[.1em] text-[#8a919c]"
        >
          TITLE
        </label>
        <input
          id="modify-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-[6px] w-full rounded-ctl border border-white/[.1] bg-transparent px-[12px] py-[10px] font-ui text-[14px] text-white outline-none"
        />

        <label
          htmlFor="modify-distance"
          className="mt-[12px] block font-ui text-[10px] font-bold tracking-[.1em] text-[#8a919c]"
        >
          DISTANCE (MI)
        </label>
        <input
          id="modify-distance"
          value={distanceMi}
          onChange={(e) => setDistanceMi(e.target.value)}
          inputMode="decimal"
          className="mt-[6px] w-full rounded-ctl border border-white/[.1] bg-transparent px-[12px] py-[10px] font-ui text-[14px] text-white outline-none"
        />

        <label
          htmlFor="modify-pace"
          className="mt-[12px] block font-ui text-[10px] font-bold tracking-[.1em] text-[#8a919c]"
        >
          PACE TARGET
        </label>
        <input
          id="modify-pace"
          value={paceTarget}
          onChange={(e) => setPaceTarget(e.target.value)}
          className="mt-[6px] w-full rounded-ctl border border-white/[.1] bg-transparent px-[12px] py-[10px] font-ui text-[14px] text-white outline-none"
        />

        {error ? (
          <div className="mt-[10px] font-ui text-[12px] font-medium text-[#F0603F]">
            {error}
          </div>
        ) : null}

        <div className="mt-[16px] flex gap-[8px]">
          <button
            onClick={handleSave}
            className="h-[46px] flex-[1.7] rounded-ctl bg-accent font-ui text-[14px] font-bold text-white"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="h-[46px] flex-1 rounded-ctl border border-white/[.16] bg-transparent font-ui text-[14px] font-bold text-ink-high"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
