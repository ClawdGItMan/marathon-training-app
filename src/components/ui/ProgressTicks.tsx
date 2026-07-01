/**
 * Instrument tick row: lime = done, grey = remaining. Design ref:
 * design-v2/Daily Screen Directions.dc.html #7b (YOUR FOCUS, 16 ticks,
 * 14x2px, lime for weeks done, #2a2f36 for remaining).
 *
 * `current` stays accepted for v1 compat but no longer renders a distinct
 * amber color — Instrument shows lime done ticks only.
 */
export function ProgressTicks({
  done,
  total,
  current,
}: {
  done: number;
  total: number;
  current?: boolean;
}) {
  void current;
  return (
    <div className="mt-[13px] flex gap-[3px]">
      {Array.from({ length: total }, (_, i) => {
        const filled = i < done;
        return (
          <span
            key={i}
            data-tick
            data-filled={filled}
            className="h-[5px] flex-1 rounded-[1px]"
            style={{
              backgroundColor: filled ? "#C9F53F" : "#22262c",
            }}
          />
        );
      })}
    </div>
  );
}
