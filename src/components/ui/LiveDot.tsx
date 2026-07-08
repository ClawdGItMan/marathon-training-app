/**
 * Instrument "live now" pulse dot: 5×5 lime dot, 3.2s ease-in-out pulse.
 * One-shot per mount via the `limePulse` keyframe; the global [data-anim]
 * guard disables it under prefers-reduced-motion. Design ref: design-v2
 * Daily Screen Directions.dc.html #7a (TODAY row).
 */
export function LiveDot() {
  return (
    <span
      data-anim
      className="h-[5px] w-[5px] rounded-full bg-sig"
      style={{ animation: "limePulse 3.2s ease-in-out infinite" }}
    />
  );
}
