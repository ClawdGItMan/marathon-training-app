type StatItem = {
  label: string;
  value: string;
  unit?: string;
  delta?: { text: string; color: string };
};

/**
 * Instrument stat grid: mono micro-labels, Geist tabular numerals, hairline
 * column separators (not v1's rgba borders). Design ref:
 * design-v2/Daily Screen Directions.dc.html #7d (DISTANCE/TIME/AVG PACE row).
 * Delta color stays caller-controlled for v1 compat.
 *
 * `rule` defaults to true (the #7d divider look); pass `rule={false}` for
 * stat rows that are gap-only with no vertical rule — #7b's THIS WEEK · RUN
 * row is `display:flex;gap:26px` with no dividers between items.
 */
export function StatGrid({ items, rule = true }: { items: StatItem[]; rule?: boolean }) {
  return (
    <div className={rule ? "grid grid-cols-3 tabular-nums" : "flex gap-[26px] tabular-nums"}>
      {items.map((item, i) => (
        <div
          key={item.label}
          data-col-rule={rule && i < items.length - 1 ? true : undefined}
          className={
            rule
              ? i < items.length - 1
                ? "hairline-r px-[10px] first:pr-[10px] first:pl-0"
                : "pl-[10px]"
              : undefined
          }
        >
          <div className="font-mono text-[8.5px] uppercase tracking-[.14em] text-[#5c6168] whitespace-nowrap">
            {item.label.toUpperCase()}
          </div>
          <div className="font-num mt-[4px] text-[17px] font-medium tracking-[-.01em] text-[#e8eaec]">
            {item.value}
            {item.unit ? (
              <span className="text-[11px] text-[#7b828c]"> {item.unit}</span>
            ) : null}
          </div>
          {item.delta ? (
            <div
              className="font-mono mt-[2px] text-[11px] font-semibold"
              style={{ color: item.delta.color }}
            >
              {item.delta.text}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
