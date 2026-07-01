export type DotTrendPoint = { x: number; y: number; value: number };

const DEFAULT_LABELS = ["T", "W", "T", "F", "S", "S", "M"];

export function DotTrendChart({
  points,
  goodThreshold,
  height = 92,
  labels = DEFAULT_LABELS,
}: {
  points: DotTrendPoint[];
  goodThreshold: number;
  height?: number;
  labels?: string[];
}) {
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const lastIndex = points.length - 1;

  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 350 ${height}`}
        style={{ display: "block" }}
      >
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="rgba(255,255,255,.14)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const good = p.value >= goodThreshold;
          const isLast = i === lastIndex;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={isLast ? 4.5 : 4}
              fill={good ? "#16e06a" : "#FFCE3F"}
              stroke={isLast ? "#161b21" : undefined}
              strokeWidth={isLast ? 2 : undefined}
            />
          );
        })}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0 6px",
          marginTop: 2,
        }}
      >
        {labels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            style={{
              font: "700 9px var(--font-num)",
              color: i === labels.length - 1 ? "#c9ced5" : "#697079",
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
