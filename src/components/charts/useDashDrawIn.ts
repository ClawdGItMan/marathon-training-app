"use client";

import { useEffect, type RefObject } from "react";

/**
 * One-shot stroke-dash draw-in for SVG polylines (~1.3s ease-out; the drw
 * pattern from design-v2). Skips cleanly in jsdom (no getTotalLength) and
 * renders the final fully-drawn state for prefers-reduced-motion / animate=false.
 */
export function useDashDrawIn(
  ref: RefObject<SVGPolylineElement | null>,
  pointsKey: string,
  enabled = true,
  animate = true
) {
  useEffect(() => {
    if (!enabled) return;
    const line = ref.current;
    if (!line || typeof line.getTotalLength !== "function") return;

    const length = line.getTotalLength();
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!animate || prefersReducedMotion) {
      line.style.transition = "none";
      line.style.strokeDasharray = "none";
      line.style.strokeDashoffset = "0";
      return;
    }

    line.style.transition = "none";
    line.style.strokeDasharray = String(length);
    line.style.strokeDashoffset = String(length);

    const id = requestAnimationFrame(() => {
      line.style.transition = "stroke-dashoffset 1.3s ease-out";
      line.style.strokeDashoffset = "0";
    });

    return () => cancelAnimationFrame(id);
  }, [ref, pointsKey, enabled, animate]);
}
