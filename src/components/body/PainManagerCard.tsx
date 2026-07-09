"use client";

import { useState } from "react";
import Link from "next/link";
import { BODY_MAP_AREAS, BodyMap } from "@/components/body/BodyMap";
import { PainAreaRow } from "@/components/body/PainAreaRow";
import type { PainArea } from "@/lib/domain/types";

/**
 * PAIN & INJURIES body — carried feature with no v2 mock (spec §3), composed
 * from Instrument patterns: body-map figure (greys, lime hotspots), ruled
 * per-area rows, and a hairline ghost button (the LOG/COACH chip style from
 * design-v2 #7d/#7e, e.g. "ACHILLES · R" / "WHY THIS WORKOUT?") rather than
 * the lime-filled CTA — this action isn't the page's primary "now/act".
 */
export function PainManagerCard({ pains }: { pains: PainArea[] }) {
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  const activeAreaIds = pains.filter((p) => p.severity > 0).map((p) => p.id);
  const selectedPain = pains.find((p) => p.id === selectedAreaId);

  return (
    <div className="pb-[16px]">
      <div className="mt-[12px] font-num text-[11px] leading-[1.5] text-[#8a919c]">
        Tap an area to log soreness or an injury.
      </div>

      <BodyMap
        areas={BODY_MAP_AREAS}
        activeId={selectedAreaId}
        activeAreaIds={activeAreaIds}
        onSelect={setSelectedAreaId}
      />

      <div className="hairline-top mb-3 pt-3">
        {pains.map((area, i) => (
          <PainAreaRow
            key={area.id}
            area={area}
            selected={area.id === selectedPain?.id}
            divider={i > 0}
          />
        ))}
      </div>

      <Link
        href="/log?focus=pain"
        className="flex h-[46px] w-full items-center justify-center rounded-[2px] border border-[var(--hair)] font-mono text-[10px] tracking-[.1em] text-[#9aa0a7]"
      >
        + LOG SORENESS OR INJURY
      </Link>
    </div>
  );
}
