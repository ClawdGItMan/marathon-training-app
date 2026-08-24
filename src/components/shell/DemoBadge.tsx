"use client";

import { useIsDemo } from "@/components/shell/demo-context";

export function DemoBadge() {
  const isDemo = useIsDemo();
  if (!isDemo) return null;
  return (
    <span className="rounded-[2px] border border-[#2a2d31] px-[8px] py-[5px] font-mono text-[9px] tracking-[.14em] text-ink-7">
      DEMO
    </span>
  );
}
