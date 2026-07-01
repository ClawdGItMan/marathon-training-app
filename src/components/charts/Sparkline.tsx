"use client";

import { useEffect, useRef } from "react";

const VIEWBOX_WIDTH = 100;

export function Sparkline({
  points,
  color,
  height = 40,
}: {
  points: number[];
  color: string;
  height?: number;
}) {
  const polylineRef = useRef<SVGPolylineElement>(null);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? VIEWBOX_WIDTH / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = points.length > 1 ? i * step : VIEWBOX_WIDTH / 2;
    // Higher value -> higher on screen (smaller y).
    const y = height - ((p - min) / range) * height;
    return `${x},${y}`;
  });
  const pointsKey = coords.join(" ");

  useEffect(() => {
    const polyline = polylineRef.current;
    if (!polyline) return;

    if (typeof polyline.getTotalLength !== "function") {
      // jsdom / unsupported environments: skip animation, render final state.
      return;
    }

    const length = polyline.getTotalLength();

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      polyline.style.transition = "none";
      polyline.style.strokeDasharray = "none";
      polyline.style.strokeDashoffset = "0";
      return;
    }

    polyline.style.transition = "none";
    polyline.style.strokeDasharray = String(length);
    polyline.style.strokeDashoffset = String(length);

    const id = requestAnimationFrame(() => {
      polyline.style.transition = "stroke-dashoffset 1.3s cubic-bezier(.2,.7,.2,1)";
      polyline.style.strokeDashoffset = "0";
    });

    return () => cancelAnimationFrame(id);
  }, [pointsKey]);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <polyline
        ref={polylineRef}
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
