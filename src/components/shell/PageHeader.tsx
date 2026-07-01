import type { ReactNode } from "react";
import { AskCoachChip } from "@/components/shell/AskCoachChip";

export function PageHeader({
  title,
  sub,
  right,
  from,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  from: string;
}) {
  return (
    <div className="flex items-end justify-between px-[22px] pt-[14px]">
      <div>
        <div className="font-display text-[30px] leading-none tracking-[-.02em] text-white">
          {title}
        </div>
        {sub ? (
          <div className="mt-2 whitespace-nowrap font-mono text-[9.5px] tracking-[.16em] text-[#5c6168]">
            {sub}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-[14px]">
        {right}
        <AskCoachChip from={from} />
      </div>
    </div>
  );
}
