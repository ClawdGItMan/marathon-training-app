"use client";

import { useEffect, useRef } from "react";

const SEGMENT_STAGGER_MS = 70;
const SEGMENT_FADE_MS = 300;

/**
 * Instrument RPE-style segment meter: thin lime segments with a staggered
 * mount fade-in, respecting prefers-reduced-motion. Design ref:
 * design-v2/Daily Screen Directions.dc.html #7d (HOW HARD? · RPE), which
 * uses flex:1 segments, 3px gap, 26px height, 1px radius, `segIn` fade with
 * ~70ms stagger per filled segment.
 */
export function SegmentMeter({
  value,
  max = 10,
  color = "#C9F53F",
}: {
  value: number;
  max?: number;
  color?: string;
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
        return (
          <span
            key={i}
            data-filled={filled}
            className="h-[26px] flex-1 rounded-[1px]"
            style={{
              backgroundColor: filled ? color : "#22262c",
            }}
          />
        );
      })}
    </div>
  );
}
