import type { ReactNode } from "react";
import { ProposedSwapBox } from "@/components/coach/ProposedSwapBox";
import type { ProposalDecision } from "@/lib/data/repo";
import type { ChatMessage, Proposal } from "@/lib/domain/types";

type Block = { key: string; node: ReactNode };

/**
 * Coach's ruled transcript (design #7f, lines 485-510) — no chat bubbles:
 * each turn is a mono label + a paragraph, separated by hairline rules,
 * with the last block flush (no trailing rule). A proposal referenced by
 * `proposalRefs` renders inline as a `ProposedSwapBox` right after its
 * message, but only while it's still open — once decided (here or on
 * Workout Detail, since it's the same repo-backed proposal) it just stops
 * appearing, matching Workout Detail's COACH SUGGESTS behavior.
 */
export function Transcript({
  contextLabel,
  weekContext,
  messages,
  openProposals,
  onDecide,
}: {
  contextLabel?: string;
  weekContext: string;
  messages: ChatMessage[];
  openProposals: Proposal[];
  onDecide: (proposalId: string, decision: ProposalDecision) => void;
}) {
  const blocks: Block[] = [];

  if (contextLabel) {
    blocks.push({
      key: "context",
      node: (
        <div className="whitespace-nowrap font-mono text-[9px] tracking-[.1em] text-[#5c6168]">
          CONTEXT: {contextLabel} · {weekContext}
        </div>
      ),
    });
  }

  for (const msg of messages) {
    const proposal = msg.proposalRefs
      ?.map((id) => openProposals.find((p) => p.id === id))
      .find((p): p is Proposal => Boolean(p));

    blocks.push({
      key: msg.id,
      node:
        msg.role === "coach" ? (
          <>
            <div className="whitespace-nowrap font-mono text-[8.5px] tracking-[.16em] text-sig">
              COACH{msg.time ? ` · ${msg.time}` : ""}
            </div>
            <p className="mt-[7px] font-num text-[12.5px] leading-[1.65] text-[#c3c8ce]">{msg.text}</p>
            {proposal ? (
              <div className="mt-3">
                <ProposedSwapBox proposal={proposal} onDecide={(d) => onDecide(proposal.id, d)} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-right">
            <div className="font-mono text-[8.5px] tracking-[.16em] text-[#5c6168]">YOU</div>
            <p className="mt-[7px] font-num text-[12.5px] leading-[1.65] text-[#8a919c]">{msg.text}</p>
          </div>
        ),
    });
  }

  return (
    <div className="flex-1 px-[22px] pt-[18px]">
      {blocks.map(({ key, node }, i) => (
        <div key={key} className={i === blocks.length - 1 ? "pt-4" : i === 0 ? "hairline pb-4" : "hairline py-4"}>
          {node}
        </div>
      ))}
    </div>
  );
}
