const PHASES = ["ADAPT", "HYPER", "MAX", "POWER", "MAINT"] as const;

/**
 * Strength phase tracker (design-v2 #7e, ~lines 405-414): 5 thin segments
 * marking the periodized stages. Past phases sit at mid-grey, the current
 * phase is signal lime with a one-shot `segIn` fade, future phases are
 * near-black. `[data-anim]` disables the fade under prefers-reduced-motion
 * via the global guard in globals.css.
 */
export function PhaseTracker({ currentIndex }: { currentIndex: number }) {
  return (
    <div>
      <div className="mt-[14px] flex gap-[3px]">
        {PHASES.map((phase, i) => (
          <span
            key={phase}
            data-anim={i === currentIndex ? "" : undefined}
            className="h-[2px] flex-1 rounded-[1px]"
            style={{
              background:
                i < currentIndex ? "#565b62" : i === currentIndex ? "var(--color-sig)" : "#22262c",
              animation: i === currentIndex ? "segIn .6s ease .4s both" : undefined,
            }}
          />
        ))}
      </div>
      <div className="hairline mt-2 flex pb-4 font-mono text-[8px] tracking-[.1em] text-[#565b62]">
        {PHASES.map((phase, i) => (
          <span
            key={phase}
            className="flex-1"
            style={{
              color: i === currentIndex ? "var(--color-sig)" : undefined,
              textAlign: i === 0 ? "left" : i === PHASES.length - 1 ? "right" : "center",
            }}
          >
            {phase}
          </span>
        ))}
      </div>
    </div>
  );
}
