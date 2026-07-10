"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { repo } from "@/lib/data";
import type { RaceGoal } from "@/lib/domain/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { Section } from "@/components/ui/Section";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { ConnectionsSection } from "@/components/settings/ConnectionsSection";
import { resolveSettingsOrigin } from "@/lib/settings";

/**
 * Settings screen (R12 — no v2 mock; the brief says compose from Instrument
 * ruled-list idioms directly). Uses PageHeader like every tab screen rather
 * than a bespoke back-chevron header (Coach/Workout Detail's pattern):
 * Settings is reached the same way Coach is — a header link from another
 * screen — but unlike Coach/Workout it isn't opened from many places, so a
 * plain mono back link in PageHeader's `right` slot (mirroring Today's own
 * forward-pointing SETTINGS link) keeps it consistent with the primary-tab
 * screens instead of inventing a third header shape.
 */
export function SettingsScreen({ from }: { from?: string }) {
  const [goal, setGoal] = useState<RaceGoal | null>(null);
  const { backHref, backLabel, originKey } = resolveSettingsOrigin(from);

  useEffect(() => {
    let cancelled = false;
    repo.getGoal().then((next) => {
      if (!cancelled) setGoal(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!goal) return null;

  return (
    <div className="pb-6">
      <PageHeader
        title="Settings"
        right={
          <Link
            href={backHref}
            className="pb-[3px] font-mono text-[9.5px] tracking-[.14em] text-[#5c6168]"
          >
            {backLabel}
          </Link>
        }
        from={originKey}
      />

      <div className="px-[22px] pt-[18px]">
        <Section header={{ label: "PROFILE" }}>
          <ProfileSection goal={goal} />
        </Section>

        <Section header={{ label: "CONNECTIONS" }} className="mt-[18px]">
          <ConnectionsSection />
        </Section>
      </div>
    </div>
  );
}
