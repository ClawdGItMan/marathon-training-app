"use client";

import { UnderlineTabs } from "@/components/ui/UnderlineTabs";

const RANGES = ["1W", "1M", "3M", "1Y"] as const;
export type Range = (typeof RANGES)[number];

/**
 * Progress range tabs: thin wrapper over the shared UnderlineTabs primitive.
 * Design ref: design-v2/Daily Screen Directions.dc.html #7b (1W/1M/3M/1Y
 * row, 3M active). Per mock #7b line 166: padding-top 18px, letter-spacing .14em.
 */
export function RangeTabs({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  return (
    <UnderlineTabs
      options={RANGES}
      value={value}
      onChange={onChange}
      paddingTop="18px"
      tracking=".14em"
    />
  );
}
