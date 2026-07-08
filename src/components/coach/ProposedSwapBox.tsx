import { CornerTickBox } from "@/components/ui/CornerTickBox";
import type { ProposalDecision } from "@/lib/data/repo";
import type { Proposal } from "@/lib/domain/types";

/**
 * Coach transcript's PROPOSED SWAP box (design #7f, lines 499-508) — the
 * same corner-tick + ACCEPT/KEEP ORIGINAL idiom as Workout Detail's COACH
 * SUGGESTS box (components/workout/CoachSuggestBox.tsx), wired to the same
 * proposal via the shared `decideProposal` repo API so a decision made here
 * is reflected there too (and vice versa) — decisions are shared state, not
 * a parallel path. Rendered inline in the transcript rather than as a
 * standalone section, using the mock's label/context/subhead copy (headline
 * + subhead, no rationale paragraph, "~44 MIN" context pulled from the
 * proposal's TIME driver).
 */
export function ProposedSwapBox({
  proposal,
  onDecide,
}: {
  proposal: Proposal;
  onDecide: (decision: ProposalDecision) => void;
}) {
  const time = proposal.drivers.find((d) => d.label === "TIME")?.value;

  return (
    <CornerTickBox label="PROPOSED SWAP" context={time?.toUpperCase()}>
      <div className="mt-2 font-display text-[15px] text-white">{proposal.headline}</div>
      <p className="mt-1 font-num text-[11px] leading-[1.55] text-[#6f757d]">{proposal.subhead}</p>
      <div className="mt-3 flex items-center gap-[18px]">
        <button
          onClick={() => onDecide("accepted")}
          className="border-b border-[rgba(201,245,63,.4)] pb-[2px] font-mono text-[11px] tracking-[.1em] text-sig"
        >
          ACCEPT
        </button>
        <button
          onClick={() => onDecide("dismissed")}
          className="font-mono text-[11px] tracking-[.1em] text-[#7b828c]"
        >
          KEEP ORIGINAL
        </button>
      </div>
    </CornerTickBox>
  );
}
