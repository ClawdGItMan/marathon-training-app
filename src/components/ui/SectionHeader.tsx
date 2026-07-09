/**
 * Instrument section header row: mono label left, mono context right.
 * Design ref: design-v2/README.md §Signature patterns "Section header row";
 * design-v2/Daily Screen Directions.dc.html #7a (THIS WEEK / 32 / 41 MI row).
 */
export function SectionHeader({
  label,
  // @deprecated Instrument has no color marks on section headers — kept only
  // so v1 call sites (Today/Progress/Body, re-ported in R5-R7) keep compiling.
  accent: _accent,
  action,
  actionHref,
  actionAriaLabel,
  context,
  contextHref,
}: {
  label: string;
  accent: string;
  action?: string;
  actionHref?: string;
  actionAriaLabel?: string;
  /** Preferred alias for `action` — right-aligned mono context text. */
  context?: string;
  contextHref?: string;
}) {
  const rightText = context ?? action;
  const rightHref = contextHref ?? actionHref;

  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-[10px] uppercase tracking-[.18em] text-[#9aa0a7] whitespace-nowrap">
        {label}
      </span>
      {rightText ? (
        rightHref ? (
          <a
            href={rightHref}
            aria-label={actionAriaLabel}
            className="font-mono text-[9px] tracking-[.1em] text-[#5c6168] whitespace-nowrap"
          >
            {rightText}
          </a>
        ) : (
          <span
            aria-label={actionAriaLabel}
            className="font-mono text-[9px] tracking-[.1em] text-[#5c6168] whitespace-nowrap"
          >
            {rightText}
          </span>
        )
      ) : null}
    </div>
  );
}
