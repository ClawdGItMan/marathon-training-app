"use client";

import { useState } from "react";
import { CornerTickBox } from "@/components/ui/CornerTickBox";
import { ModifySheet } from "@/components/today/ModifySheet";
import type { ProposalDecision } from "@/lib/data/repo";
import type { PlannedSession, Proposal } from "@/lib/domain/types";

/** Single mono drivers line, e.g. "HRV 48 ↓12% · SLEEP 6:12 −1:32 · ACHILLES 2/10 mild". */
function driverLine(proposal: Proposal): string {
  return proposal.drivers
    .map((d) => {
      const delta =
        d.deltaPct !== undefined
          ? ` ${d.deltaPct < 0 ? "↓" : "↑"}${Math.abs(d.deltaPct)}%`
          : d.deltaText
            ? ` ${d.deltaText}`
            : "";
      return `${d.label} ${d.value}${delta}`;
    })
    .join(" · ");
}

/**
 * Today's recommendation as an Instrument corner-tick box (pattern from
 * design-v2 #7f PROPOSED SWAP / #7e COACH): lime bracket, mono label +
 * badge context, mono text actions with lime-underlined ACCEPT.
 */
export function RecommendationBox({
  proposal,
  onDecide,
}: {
  proposal: Proposal;
  onDecide: (decision: ProposalDecision, edited?: PlannedSession) => void;
}) {
  const [showModify, setShowModify] = useState(false);

  return (
    <>
      <div className="px-[22px] pt-[18px]">
        <CornerTickBox label="TODAY'S RECOMMENDATION" context={proposal.badge}>
          <div className="mt-[10px] font-display text-[19px] leading-[1.15] text-white">
            {proposal.headline}
          </div>
          <div className="mt-[5px] font-display text-[13px] text-[#c3c8ce]">
            {proposal.subhead}
          </div>
          <p className="mt-2 font-num text-[11.5px] leading-[1.6] text-[#8a919c]">
            {proposal.rationale}
          </p>
          <div className="mt-3 overflow-x-auto whitespace-nowrap font-mono text-[9px] tracking-[.08em] text-[#9aa0a7]">
            {driverLine(proposal)}
          </div>
          <div className="mt-[14px] flex items-center gap-[18px]">
            <button
              onClick={() => onDecide("accepted")}
              className="border-b border-[rgba(201,245,63,.4)] pb-[2px] font-mono text-[11px] tracking-[.1em] text-sig"
            >
              ACCEPT
            </button>
            <button
              onClick={() => setShowModify(true)}
              className="font-mono text-[11px] tracking-[.1em] text-[#7b828c]"
            >
              MODIFY
            </button>
            <button
              onClick={() => onDecide("dismissed")}
              className="font-mono text-[11px] tracking-[.1em] text-[#7b828c]"
            >
              OVERRIDE
            </button>
          </div>
          <div className="mt-3 font-num text-[10.5px] text-[#5c6168]">
            Reviewed {proposal.reviewedAt} — nothing changes until you decide.
          </div>
        </CornerTickBox>
      </div>

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
