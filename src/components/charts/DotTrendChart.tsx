export type DotTrendPoint = { x: number; y: number; value: number };

// Order matches design #7c RECOVERY · 7 DAYS day-of-week labels exactly (ends on today).
const DEFAULT_LABELS = ["T", "F", "S", "S", "M", "T", "W"];
// Draw-in dash length per design #7c RECOVERY · 7 DAYS (drw pattern): the
// dasharray covers the full path so the line sweeps in once, then reads solid.
const LINE_DASH = 380;

export function DotTrendChart({
  points,
  height = 92,
  labels = DEFAULT_LABELS,
}: {
  points: DotTrendPoint[];
  /**
   * @deprecated Inert since the Instrument restyle (R4): dots are grey with a
   * lime "now" endpoint; threshold coloring is gone. Accepted so v1 Body
   * compiles until its re-port (R5-R7), then remove.
   */
  goodThreshold?: number;
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
        <line
          x1="0"
          y1={height / 2}
          x2="350"
          y2={height / 2}
          stroke="rgba(255,255,255,.07)"
          strokeWidth={1}
        />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#565b62"
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeDasharray={LINE_DASH}
          strokeDashoffset={LINE_DASH}
          data-anim=""
          style={{ animation: "drw 1.2s ease-out .4s both" }}
        />
        {points.map((p, i) => {
          const isLast = i === lastIndex;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={isLast ? 3 : 2.4}
              fill={isLast ? "#C9F53F" : "#9aa0a7"}
              data-anim={isLast ? "" : undefined}
              style={
                isLast
                  ? { animation: "segIn .4s ease 1.5s both, limePulse 3.2s ease-in-out 2.2s infinite" }
                  : undefined
              }
            />
          );
        })}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0 6px",
          marginTop: 6,
          font: "500 8px var(--font-mono)",
          letterSpacing: ".12em",
          color: "#5c6168",
        }}
      >
        {labels.map((label, i) => (
          <span key={`${label}-${i}`}>{label}</span>
        ))}
      </div>
    </div>
  );
}
