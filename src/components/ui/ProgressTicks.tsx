export function ProgressTicks({
  done,
  total,
  current,
}: {
  done: number;
  total: number;
  current?: boolean;
}) {
  return (
    <div className="mt-[13px] flex gap-[3px]">
      {Array.from({ length: total }, (_, i) => {
        const filled = i < done;
        const isCurrent = current && i === done;
        const backgroundColor = isCurrent
          ? "#FFCE3F"
          : filled
            ? "var(--color-accent)"
            : "rgba(255,255,255,.1)";
        return (
          <span
            key={i}
            data-tick
            data-filled={filled}
            className="h-[5px] flex-1 rounded-[1px]"
            style={{ backgroundColor }}
          />
        );
      })}
    </div>
  );
}
