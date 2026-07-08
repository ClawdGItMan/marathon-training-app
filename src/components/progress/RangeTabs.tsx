"use client";

import { UnderlineTabs } from "@/components/ui/UnderlineTabs";

const RANGES = ["1W", "1M", "3M", "1Y"] as const;
export type Range = (typeof RANGES)[number];

/**
 * Progress range tabs: thin wrapper over the shared UnderlineTabs primitive.
 * Design ref: design-v2/Daily Screen Directions.dc.html #7b (1W/1M/3M/1Y
 * row, 3M active).
 */
export function RangeTabs({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  return <UnderlineTabs options={RANGES} value={value} onChange={onChange} />;
}
