"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { ModifySheet } from "@/components/today/ModifySheet";
import type { Proposal } from "@/lib/domain/types";
import type { ProposalDecision } from "@/lib/data/repo";
import type { PlannedSession } from "@/lib/domain/types";

const BADGE_COLOR: Record<string, string> = {
  HOLD: "#E8A33A",
  GO: "#16e06a",
  ADJUST: "#34B3E6",
};

export function RecommendationCard({
  proposal,
  onDecide,
}: {
  proposal: Proposal;
  onDecide: (decision: ProposalDecision, edited?: PlannedSession) => void;
}) {
  const [showModify, setShowModify] = useState(false);

  return (
    <>
      <Card className="mx-4 mt-4 p-[18px] pb-[15px]">
        <div className="flex items-center justify-between">
          <span className="font-ui text-[11px] font-bold tracking-[.14em] text-accent">
            TODAY&apos;S RECOMMENDATION
          </span>
          <span
            className="inline-flex items-center rounded-ctl px-[9px] py-[5px] font-ui text-[10px] font-extrabold tracking-[.14em] text-[#15181d]"
            style={{ backgroundColor: BADGE_COLOR[proposal.badge] ?? "#E8A33A" }}
          >
            {proposal.badge}
          </span>
        </div>

        <div className="mt-[11px] font-ui text-[27px] font-bold leading-[1.05] tracking-[-.01em] text-white">
          {proposal.headline}
        </div>
        <div className="mt-[5px] font-ui text-[14px] font-semibold text-[#c9ced5]">
          {proposal.subhead}
        </div>
        <p className="mt-3 font-ui text-[13.5px] font-normal leading-[1.62] text-[#a2a8b2]">
          {proposal.rationale}
        </p>

        <div className="mt-[15px] grid grid-cols-3 border-y border-white/[.08] tabular-nums">
          {proposal.drivers.map((driver, i) => (
            <div
              key={driver.label}
              className={
                i < proposal.drivers.length - 1
                  ? "border-r border-white/[.08] px-3 py-3 first:pl-0"
                  : "px-3 py-3 last:pr-0"
              }
            >
              <div className="font-ui text-[9px] font-bold tracking-[.13em] text-[#7b828c]">
                {driver.label}
              </div>
              <div className="mt-[6px] flex items-baseline gap-[5px]">
                <span className="font-num text-[18px] font-medium tracking-[-.01em] text-white">
                  {driver.value}
                </span>
                {driver.deltaPct !== undefined ? (
                  // V1 COMPAT: static grey (design v2 kills alarm-colored deltas); re-port in R5-R7.
                  <span className="font-num text-[10px] font-semibold text-[#9aa0a7]">
                    {driver.deltaPct >= 0 ? "↑" : "↓"}
                    {Math.abs(driver.deltaPct)}%
                  </span>
                ) : driver.deltaText ? (
                  // V1 COMPAT: static grey (design v2 kills alarm-colored deltas); re-port in R5-R7.
                  <span className="font-num text-[10px] font-semibold text-[#9aa0a7]">
                    {driver.deltaText}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onDecide("accepted")}
            className="h-[46px] flex-[1.7] rounded-ctl bg-accent font-ui text-[14px] font-bold text-white"
          >
            Accept
          </button>
          <button
            onClick={() => setShowModify(true)}
            className="h-[46px] flex-1 rounded-ctl border border-white/[.16] bg-transparent font-ui text-[14px] font-bold text-ink-high"
          >
            Modify
          </button>
          <button
            onClick={() => onDecide("dismissed")}
            className="h-[46px] flex-1 rounded-ctl bg-transparent font-ui text-[14px] font-bold text-[#7b828c]"
          >
            Override
          </button>
        </div>
        <div className="mt-[11px] text-center font-ui text-[11px] font-medium text-[#697079]">
          Reviewed {proposal.reviewedAt} — nothing changes until you decide.
        </div>
      </Card>

      {showModify ? (
        <ModifySheet
          session={proposal.after}
          onSave={(edited) => {
            setShowModify(false);
            onDecide("modified", edited);
          }}
          onCancel={() => setShowModify(false)}
        />
      ) : null}
    </>
  );
}
