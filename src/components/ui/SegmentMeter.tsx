export function SegmentMeter({
  value,
  max = 10,
  color = "#FF9A3D",
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: max }, (_, i) => {
        const filled = i < value;
        return (
          <span
            key={i}
            data-filled={filled}
            className="h-[18px] w-[7px] rounded-[1px]"
            style={{
              backgroundColor: filled ? color : "rgba(255,255,255,.08)",
            }}
          />
        );
      })}
    </div>
  );
}
