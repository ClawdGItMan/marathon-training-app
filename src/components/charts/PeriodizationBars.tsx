export type PeriodizationPhase = "base" | "build" | "peak" | "taper";

export type PeriodizationWeek = {
  phase: PeriodizationPhase;
  mi: number;
};

const PHASE_COLOR: Record<PeriodizationPhase, string> = {
  base: "#7CB3D9",
  build: "#7CB3D9",
  peak: "#FFCE3F",
  taper: "rgba(255,255,255,.25)",
};

const DIMMED_COLOR = "rgba(255,255,255,.1)";

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
        <span style={{ font: "700 12px var(--font-ui)", letterSpacing: ".05em", color: "#fff" }}>
          16-WEEK BLOCK
        </span>
        {peakLabel ? (
          <span style={{ font: "600 11px var(--font-ui)", color: "#8a919c" }}>{peakLabel}</span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "3px",
          height: 42,
          marginTop: 12,
        }}
      >
        {weeks.map((week, i) => {
          const heightPct = Math.max((week.mi / maxMi) * 100, 4);
          const dimmed = i > currentWeek - 1;
          const color = dimmed ? DIMMED_COLOR : PHASE_COLOR[week.phase];
          return (
            <div
              key={i}
              data-bar
              data-phase={week.phase}
              className="flex-1"
              style={{
                flex: 1,
                height: `${heightPct}%`,
                background: color,
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 9,
          font: "700 8.5px var(--font-ui)",
          letterSpacing: ".06em",
          color: "#697079",
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
