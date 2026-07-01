"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { localRepo } from "@/lib/data/local-repo";
import type { PainArea, RecoverySnapshot } from "@/lib/domain/types";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
    localRepo.getLatestRecovery(),
    localRepo.getRecovery7d(),
    localRepo.getPains(),
  ]);

  return { recovery, recovery7d, pains };
}

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date
    .toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })
    .replace(",", "")
    .toUpperCase();
}

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
    <div className="bg-app pb-6">
      <div className="flex items-start justify-between px-[18px] pb-[2px] pt-[6px]">
        <div>
          <div className="font-ui text-[22px] font-bold tracking-[-.01em] text-white">
            Recovery
          </div>
          <div className="mt-[2px] font-ui text-[11px] font-semibold tracking-[.05em] text-[#7b828c]">
            {formatDate(recovery.date)}
          </div>
        </div>
        <Link
          href="/coach"
          className="inline-flex items-center gap-[6px] rounded-ctl border border-white/[.12] bg-white/[.05] px-[11px] py-[7px]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#3866e0">
            <path d="M12 2.5l1.9 7.6 7.6 1.9-7.6 1.9L12 21.5l-1.9-7.6L2.5 12l7.6-1.9z" />
          </svg>
          <span className="font-ui text-[10px] font-bold tracking-[.1em] text-accent">
            ASK AI
          </span>
        </Link>
      </div>

      <RecoveryHero recoveryPct={recovery.recoveryPct} recoveryDelta={recovery.recoveryDelta} />

      <SectionHeader label="VITALS" accent="#7CB3D9" action="14 DAYS ›" actionAriaLabel="View 14 day vitals" />
      <VitalsCard
        hrv={recovery.hrv}
        hrvDeltaPct={recovery.hrvDeltaPct}
        rhr={recovery.rhr}
        rhrDelta={recovery.rhrDelta}
        respRate={recovery.respRate}
        hrv14d={recovery7d.map((r) => r.hrv)}
      />

      <SectionHeader label="SLEEP" accent="#7CB3D9" action="DETAIL ›" actionAriaLabel="View sleep detail" />
      <SleepCard
        durationMin={recovery.sleep.durationMin}
        needMin={recovery.sleep.needMin}
        efficiencyPct={recovery.sleep.efficiencyPct}
        deepMin={recovery.sleep.deepMin}
        remMin={recovery.sleep.remMin}
        lightMin={recovery.sleep.lightMin}
      />

      <SectionHeader
        label="RECOVERY · 7 DAYS"
        accent="#16e06a"
        action={`${avgRecoveryPct}% avg`}
      />
      <Recovery7dCard recoveryPct7d={recovery7d.map((r) => r.recoveryPct)} />

      <SectionHeader label="PAIN & INJURIES" accent="#FF9A3D" action="HISTORY ›" actionAriaLabel="View pain and injury history" />
      <PainManagerCard pains={pains} />
    </div>
  );
}
