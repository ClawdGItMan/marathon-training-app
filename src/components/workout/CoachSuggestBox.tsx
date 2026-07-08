import { CornerTickBox } from "@/components/ui/CornerTickBox";
import type { ProposalDecision } from "@/lib/data/repo";
import type { Proposal } from "@/lib/domain/types";

/**
 * Workout Detail's COACH SUGGESTS corner-tick box (design #6a, lines
 * 608-617): same ACCEPT lime-underline / dismiss idiom as Today's
 * RecommendationBox, wired to the workout-scope proposal (accept swaps the
 * breakdown via the existing proposal decision APIs; keep-original just
 * dismisses — the plan is never mutated).
 */
export function CoachSuggestBox({
  proposal,
  onDecide,
}: {
  proposal: Proposal;
  onDecide: (decision: ProposalDecision) => void;
}) {
  return (
    <div className="mt-2 px-[22px]">
      <CornerTickBox label="COACH SUGGESTS">
        <div className="mt-2 font-display text-[15px] text-white">{proposal.headline}</div>
        <p className="mt-[5px] font-num text-[11.5px] leading-[1.55] text-[#8a919c]">
          {proposal.rationale}
        </p>
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
    </div>
  );
}
