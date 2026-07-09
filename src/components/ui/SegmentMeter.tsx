"use client";

import { useEffect, useRef } from "react";

const SEGMENT_STAGGER_MS = 70;
const SEGMENT_FADE_MS = 300;

/**
 * Instrument RPE-style segment meter: thin lime segments with a staggered
 * mount fade-in, respecting prefers-reduced-motion. Design ref:
 * design-v2/Daily Screen Directions.dc.html #7d (HOW HARD? · RPE), which
 * uses flex:1 segments, 3px gap, 26px height, 1px radius, `segIn` fade with
 * ~70ms stagger per filled segment. `height` overrides the 26px default for
 * the thinner 8px SEVERITY variant (same #7d). Passing `onChange` makes the
 * meter interactive (Log's tap-to-set RPE/SEVERITY, #7d) by rendering each
 * segment as a labeled button instead of a read-only span.
 */
export function SegmentMeter({
  value,
  max = 10,
  color = "#C9F53F",
  height = 26,
  onChange,
  ariaLabel,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  onChange?: (value: number) => void;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const segments = Array.from(
      container.querySelectorAll<HTMLElement>("[data-filled=true]")
    );

    if (prefersReducedMotion) {
      segments.forEach((seg) => {
        seg.style.transition = "none";
        seg.style.opacity = "1";
      });
      return;
    }

    segments.forEach((seg) => {
      seg.style.transition = "none";
      seg.style.opacity = "0";
    });

    const id = requestAnimationFrame(() => {
      segments.forEach((seg, i) => {
        seg.style.transition = `opacity ${SEGMENT_FADE_MS}ms ease ${i * SEGMENT_STAGGER_MS}ms`;
        seg.style.opacity = "1";
      });
    });

    return () => cancelAnimationFrame(id);
  }, [value, max]);

  return (
    <div ref={containerRef} className="flex gap-[3px]">
      {Array.from({ length: max }, (_, i) => {
        const filled = i < value;
        const style = { height: `${height}px`, backgroundColor: filled ? color : "#22262c" };

        if (onChange) {
          return (
            <button
              key={i}
              type="button"
              data-filled={filled}
              aria-label={ariaLabel ? `${ariaLabel} ${i + 1}` : `${i + 1}`}
              onClick={() => onChange(i + 1)}
              className="flex-1 rounded-[1px]"
              style={style}
            />
          );
        }

        return <span key={i} data-filled={filled} className="flex-1 rounded-[1px]" style={style} />;
      })}
    </div>
  );
}
