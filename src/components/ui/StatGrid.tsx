type StatItem = {
  label: string;
  value: string;
  unit?: string;
  delta?: { text: string; color: string };
};

export function StatGrid({ items }: { items: StatItem[] }) {
  return (
    <div className="grid grid-cols-3 tabular-nums">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={
            i < items.length - 1
              ? "border-r border-white/[.08] px-[10px] first:pr-[10px] first:pl-0"
              : "pl-[10px]"
          }
        >
          <div className="font-ui text-[9px] font-bold tracking-[.12em] text-ink-sec">
            {item.label.toUpperCase()}
          </div>
          <div className="mt-[5px] font-num text-[19px] font-medium tracking-[-.01em] text-white">
            {item.value}
            {item.unit ? (
              <span className="text-[11px] text-ink-sec"> {item.unit}</span>
            ) : null}
          </div>
          {item.delta ? (
            <div
              className="mt-[2px] font-ui text-[11px] font-semibold"
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
