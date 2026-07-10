"use client";

import { useEffect, useState } from "react";
import { repo } from "@/lib/data";
import type { PainArea, RecoverySnapshot } from "@/lib/domain/types";
import { formatDayContext } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { Section } from "@/components/ui/Section";
import { RecoveryHero } from "@/components/body/RecoveryHero";
import { VitalsCard } from "@/components/body/VitalsCard";
import { SleepCard } from "@/components/body/SleepCard";
import { Recovery7dCard } from "@/components/body/Recovery7dCard";
import { PainManagerCard } from "@/components/body/PainManagerCard";

type BodyState = {
  recovery: RecoverySnapshot;
  recovery7d: RecoverySnapshot[];
  pains: PainArea[];
};

async function loadBodyState(): Promise<BodyState> {
  const [recovery, recovery7d, pains] = await Promise.all([
    repo.getLatestRecovery(),
    repo.getRecovery7d(),
    repo.getPains(),
  ]);

  return { recovery, recovery7d, pains };
}

/**
 * Body ("Recovery") screen, ported 1:1 from design-v2 #7c (spec §Tasks R7).
 * Hero has no v2 section header (its own hairline close instead); VITALS,
 * SLEEP, and RECOVERY · 7 DAYS are Section-wrapped per the shared ruled-
 * section pattern; PAIN & INJURIES is a carried feature with no v2 mock,
 * composed from the same Instrument primitives.
 */
export function BodyScreen() {
  const [state, setState] = useState<BodyState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const next = await loadBodyState();
      if (!cancelled) setState(next);
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const { recovery, recovery7d, pains } = state;
  const avgRecoveryPct = Math.round(
    recovery7d.reduce((sum, r) => sum + r.recoveryPct, 0) / recovery7d.length
  );

  return (
    <div className="pb-6">
      <PageHeader title="Recovery" sub={formatDayContext(recovery.date)} from="body" />

      <div className="mt-[6px]">
        <RecoveryHero recoveryPct={recovery.recoveryPct} recoveryDelta={recovery.recoveryDelta} />
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section header={{ label: "VITALS", context: "14 DAYS →" }}>
          <VitalsCard
            hrv={recovery.hrv}
            hrvDeltaPct={recovery.hrvDeltaPct}
            rhr={recovery.rhr}
            rhrDelta={recovery.rhrDelta}
            respRate={recovery.respRate}
            hrv14d={recovery7d.map((r) => r.hrv)}
          />
        </Section>
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section>
          <SleepCard
            durationMin={recovery.sleep.durationMin}
            needMin={recovery.sleep.needMin}
            efficiencyPct={recovery.sleep.efficiencyPct}
            deepMin={recovery.sleep.deepMin}
            remMin={recovery.sleep.remMin}
            lightMin={recovery.sleep.lightMin}
          />
        </Section>
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section header={{ label: "RECOVERY · 7 DAYS", context: `${avgRecoveryPct}% AVG` }}>
          <Recovery7dCard recoveryPct7d={recovery7d.map((r) => r.recoveryPct)} />
        </Section>
      </div>

      <div className="px-[22px] pt-[18px]">
        <Section header={{ label: "PAIN & INJURIES" }}>
          <PainManagerCard pains={pains} />
        </Section>
      </div>
    </div>
  );
}
