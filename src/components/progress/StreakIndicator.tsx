/**
 * Pulsing lime dot + "N-DAY STREAK" mono label — Progress page-header right
 * slot. Design ref: design-v2/Daily Screen Directions.dc.html #7b (line 163).
 */
export function StreakIndicator({ streak }: { streak: number }) {
  return (
    <span className="inline-flex items-center gap-[6px] pb-[3px]">
      <span
        data-anim
        className="h-[5px] w-[5px] flex-none rounded-full bg-sig"
        style={{ animation: "limePulse 3.2s ease-in-out infinite" }}
      />
      <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[.14em] text-[#9aa0a7]">
        {streak}-DAY STREAK
      </span>
    </span>
  );
}
