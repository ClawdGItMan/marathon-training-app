import type { PeriodizationWeek } from "@/lib/domain/types";

export type { PeriodizationWeek };
export type PeriodizationPhase = PeriodizationWeek["phase"];

// Phase greys per design #7a (16-WEEK BLOCK): volume reads through height,
// phase through grey step; only the current week carries signal lime.
const PHASE_COLOR: Record<PeriodizationPhase, string> = {
  base: "#242930",
  build: "#2d333b",
  peak: "#363d46",
  taper: "#242930",
};

const SIGNAL = "#C9F53F";
const FIRST_DELAY_S = 0.08;
const STAGGER_S = 0.035;

export function PeriodizationBars({
  weeks,
  currentWeek,
  peakLabel = "peak 52 mi/wk",
}: {
  weeks: PeriodizationWeek[];
  currentWeek: number;
  peakLabel?: string;
}) {
  const maxMi = Math.max(...weeks.map((w) => w.mi), 1);

  const phaseCounts = weeks.reduce<Record<PeriodizationPhase, number>>(
    (acc, w) => {
      acc[w.phase] = (acc[w.phase] ?? 0) + 1;
      return acc;
    },
    { base: 0, build: 0, peak: 0, taper: 0 }
  );

  const phaseOrder: PeriodizationPhase[] = ["base", "build", "peak", "taper"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span
          style={{
            font: "500 10px var(--font-mono)",
            letterSpacing: ".18em",
            color: "#9aa0a7",
            whiteSpace: "nowrap",
          }}
        >
          16-WEEK BLOCK
        </span>
        {peakLabel ? (
          <span
            style={{
              font: "500 9px var(--font-mono)",
              letterSpacing: ".1em",
              color: "#5c6168",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {peakLabel}
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "4px",
          height: 56,
          marginTop: 12,
        }}
      >
        {weeks.map((week, i) => {
          const heightPct = Math.max((week.mi / maxMi) * 100, 4);
          const isCurrent = i === currentWeek - 1;
          return (
            <div
              key={i}
              data-bar
              data-anim=""
              data-phase={week.phase}
              style={{
                flex: 1,
                height: `${heightPct}%`,
                background: isCurrent ? SIGNAL : PHASE_COLOR[week.phase],
                borderRadius: 1,
                transformOrigin: "bottom",
                animation: `barUp .55s cubic-bezier(.2,.7,.3,1) ${(FIRST_DELAY_S + i * STAGGER_S).toFixed(3)}s both`,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 8,
          font: "500 8px var(--font-mono)",
          letterSpacing: ".12em",
          color: "#5c6168",
        }}
      >
        {phaseOrder.map((phase, i) => (
          <span
            key={phase}
            style={{
              width: `${((phaseCounts[phase] ?? 0) / weeks.length) * 100}%`,
              textAlign: i === phaseOrder.length - 1 ? "right" : "left",
            }}
          >
            {phase.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
