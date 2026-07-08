"use client";

const RANGES = ["1W", "1M", "3M", "1Y"] as const;
export type Range = (typeof RANGES)[number];

/**
 * Instrument range tabs: lime underline on the active tab, grey inactive,
 * hairline closing the row. Design ref: design-v2/Daily Screen Directions.dc.html
 * #7b (1W/1M/3M/1Y row, 3M active).
 */
export function RangeTabs({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  return (
    <div className="hairline flex gap-[22px] px-[22px] pt-[18px]">
      {RANGES.map((range) => {
        const active = range === value;
        return (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            className={`pb-[9px] font-mono text-[10px] tracking-[.14em] ${
              active ? "border-b-2 border-sig text-white" : "text-[#5c6168]"
            }`}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}
