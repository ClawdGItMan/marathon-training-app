"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { repo } from "@/lib/data";
import { seed } from "@/lib/data/seed";
import { PageHeader } from "@/components/shell/PageHeader";
import { ImportedRunSection } from "@/components/log/ImportedRunSection";
import { RpeSection } from "@/components/log/RpeSection";
import { PainSection } from "@/components/log/PainSection";
import { formatDayContext } from "@/lib/format";
import type { Activity, PainArea, PlannedSession } from "@/lib/domain/types";

type LogState = {
  session: PlannedSession;
  pains: PainArea[];
  activity: Activity | null;
};

async function loadLogState(): Promise<LogState> {
  const [session, pains, activity] = await Promise.all([
    repo.getSession(seed.todaySessionId),
    repo.getPains(),
    repo.getLatestActivity(),
  ]);
  return { session, pains, activity };
}

const DEFAULT_RPE = 4;

/**
 * Log tab (design #7d): AUTO-IMPORTED · STRAVA import card, RPE segment
 * meter, ANY PAIN? chip toggles + SEVERITY meter, SAVE LOG CTA. SAVE LOG
 * calls repo.logRun, which folds the pain override into the same
 * overlay write as the run log (see repo.ts) — no separate logPain call is
 * needed — then navigates back to /today. The imported run comes from
 * `repo.getLatestActivity()` (Task 11) — real once a Strava/Whoop activity
 * has synced, with a seed fallback before any import has happened yet
 * (localRepo always serves the seed value; supabaseRepo falls back only
 * when `activities` has zero rows for this user).
 */
export function LogScreen({ focusPain = false }: { focusPain?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<LogState | null>(null);
  const [rpe, setRpe] = useState(DEFAULT_RPE);
  const [selectedPain, setSelectedPain] = useState<string | null>(null);
  const [severity, setSeverity] = useState(0);
  const painSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadLogState().then((next) => {
      if (cancelled) return;
      setState(next);
      const top = next.pains.length
        ? next.pains.reduce((a, b) => (b.severity > a.severity ? b : a))
        : undefined;
      if (top && top.severity > 0) {
        setSelectedPain(top.id);
        setSeverity(top.severity);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!focusPain || !state) return;
    const node = painSectionRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "start" });
    }
  }, [focusPain, state]);

  const handleSave = useCallback(async () => {
    if (!state) return;
    await repo.logRun({
      sessionId: state.session.id,
      rpe,
      painAreaId: selectedPain ?? undefined,
      painSeverity: selectedPain ? severity : undefined,
    });
    router.push("/today");
  }, [rpe, router, selectedPain, severity, state]);

  const handleSelectPain = useCallback((id: string | null) => {
    setSelectedPain(id);
    if (id === null) setSeverity(0);
  }, []);

  if (!state) return null;
  const { activity } = state;

  return (
    <div className="pb-6">
      <PageHeader title="Log" sub={formatDayContext(state.session.date)} from="log" />

      {activity ? (
        <div className="px-[22px] pt-[22px]">
          <ImportedRunSection activity={activity} />
        </div>
      ) : null}

      <div className="px-[22px] pt-[18px]">
        <RpeSection rpe={rpe} onChange={setRpe} />
      </div>

      <div ref={painSectionRef} className="px-[22px] pt-[18px]">
        <PainSection
          selectedPain={selectedPain}
          severity={severity}
          onSelectPain={handleSelectPain}
          onSeverityChange={setSeverity}
        />
      </div>

      <div className="px-[22px] pb-1 pt-[16px]">
        <button
          onClick={handleSave}
          className="h-[50px] w-full rounded-[2px] bg-sig font-display text-[13px] font-semibold uppercase tracking-[.06em] text-[#0B0C0E]"
        >
          SAVE LOG
        </button>
      </div>
    </div>
  );
}
