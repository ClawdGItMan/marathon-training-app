"use client";

import { useState } from "react";
import Link from "next/link";
import { BODY_MAP_AREAS, BodyMap } from "@/components/body/BodyMap";
import { PainAreaRow } from "@/components/body/PainAreaRow";
import type { PainArea } from "@/lib/domain/types";

export function PainManagerCard({ pains }: { pains: PainArea[] }) {
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  const activeAreaIds = pains.filter((p) => p.severity > 0).map((p) => p.id);
  const selectedPain = pains.find((p) => p.id === selectedAreaId);

  return (
    <div className="mx-4 rounded-card border border-white/[.05] bg-[#171c23] p-[14px_15px_15px] shadow-[0_1px_0_rgba(255,255,255,.03)_inset,0_10px_26px_-16px_rgba(0,0,0,.55)]">
      <div className="mb-[2px] font-ui text-[11px] font-normal leading-[1.5] text-[#8a919c]">
        Tap an area to log soreness or an injury.
      </div>

      <BodyMap
        areas={BODY_MAP_AREAS}
        activeId={selectedAreaId}
        activeAreaIds={activeAreaIds}
        onSelect={setSelectedAreaId}
      />

      <div className="my-[6px] mb-3 h-px bg-white/[.06]" />

      {pains.map((area, i) => (
        <PainAreaRow
          key={area.id}
          area={area}
          selected={area.id === selectedPain?.id}
          divider={i > 0}
        />
      ))}

      <Link
        href="/log?focus=pain"
        className="mt-[14px] flex h-11 w-full items-center justify-center rounded-ctl border border-[rgba(255,154,61,.35)] bg-[rgba(255,154,61,.10)] font-ui text-[13px] font-bold text-[#FF9A3D]"
      >
        + Log soreness or injury
      </Link>
    </div>
  );
}
