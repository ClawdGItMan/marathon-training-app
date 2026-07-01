import type { ReactNode } from "react";

/**
 * Instrument corner-tick box: hairline border, 2px radius, with a 14×14px
 * lime corner bracket overlapping the top-left corner. Used for coach notes
 * / proposed swaps. Design ref: design-v2/Daily Screen Directions.dc.html
 * #7e (COACH box, ~lines 447-451) and #6a (COACH SUGGESTS box).
 *
 * Markup ported 1:1 from the design HTML:
 *   border:1px solid var(--hair); border-radius:2px; padding:14px 16px;
 *   position:relative
 *   + absolute top:-1px left:-1px w:14px h:14px
 *     border-top:2px solid var(--sig); border-left:2px solid var(--sig)
 */
export function CornerTickBox({
  label,
  context,
  children,
}: {
  label?: string;
  context?: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--hair)",
        borderRadius: "2px",
        padding: "14px 16px",
        position: "relative",
      }}
    >
      <span
        data-corner-tick
        style={{
          position: "absolute",
          top: "-1px",
          left: "-1px",
          width: "14px",
          height: "14px",
          borderTop: "2px solid var(--color-sig)",
          borderLeft: "2px solid var(--color-sig)",
        }}
      />
      {label || context ? (
        <div className="flex items-baseline justify-between">
          {label ? (
            <span className="font-mono text-[9.5px] uppercase tracking-[.18em] text-sig whitespace-nowrap">
              {label}
            </span>
          ) : null}
          {context ? (
            <span className="font-mono text-[9px] tracking-[.1em] text-[#5c6168] whitespace-nowrap">
              {context}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
