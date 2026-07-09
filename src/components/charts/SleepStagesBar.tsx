import { formatHM } from "@/lib/format";

// Stage greys per design #7c SLEEP: brightness encodes depth (deep brightest),
// remainder-of-need reads as the darkest track. No blues, no per-stage hues.
const STAGE_COLOR = {
  deep: "#e8eaec",
  rem: "#7c828a",
  light: "#363d46",
  empty: "#1c2025",
};

// Per-stage legend greys per design #7c SLEEP legend row (distinct from the
// bar-segment greys above): deep brightest, light dimmest.
const LEGEND_COLOR = {
  deep: "#9aa0a7",
  rem: "#7c828a",
  light: "#565b62",
};

function legendStyle(color: string) {
  return {
    font: "500 8px var(--font-mono)",
    letterSpacing: ".1em",
    color,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  } as const;
}

export function SleepStagesBar({
  deepMin,
  remMin,
  lightMin,
  needMin,
}: {
  deepMin: number;
  remMin: number;
  lightMin: number;
  needMin: number;
}) {
  const denom = needMin || 1;
  const deepPct = Math.max((deepMin / denom) * 100, 0);
  const remPct = Math.max((remMin / denom) * 100, 0);
  const lightPct = Math.max((lightMin / denom) * 100, 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 2,
          height: 8,
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${deepPct}%`, background: STAGE_COLOR.deep }} />
        <div style={{ width: `${remPct}%`, background: STAGE_COLOR.rem }} />
        <div style={{ width: `${lightPct}%`, background: STAGE_COLOR.light }} />
        <div style={{ flex: 1, background: STAGE_COLOR.empty }} />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 9 }}>
        <span style={legendStyle(LEGEND_COLOR.deep)}>Deep {formatHM(deepMin)}</span>
        <span style={legendStyle(LEGEND_COLOR.rem)}>REM {formatHM(remMin)}</span>
        <span style={legendStyle(LEGEND_COLOR.light)}>Light {formatHM(lightMin)}</span>
      </div>
    </div>
  );
}
