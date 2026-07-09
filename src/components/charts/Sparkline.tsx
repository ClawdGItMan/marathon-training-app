"use client";

import { useRef } from "react";
import { useDashDrawIn } from "./useDashDrawIn";

const VIEWBOX_WIDTH = 100;

export function Sparkline({
  points,
  color = "#565b62",
  height = 40,
  endDotColor,
}: {
  points: number[];
  color?: string;
  height?: number;
  /** Renders an endpoint dot at the last datum (lime for "live now" per design #7c VITALS). Omit for no dot. */
  endDotColor?: string;
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
    return { x, y };
  });
  const pointsAttr = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const last = coords[coords.length - 1];

  useDashDrawIn(polylineRef, pointsAttr);

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
        points={pointsAttr}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endDotColor && last ? (
        <circle
          cx={last.x}
          cy={last.y}
          r={2.6}
          fill={endDotColor}
          data-anim=""
          style={{ animation: "segIn .4s ease 1.4s both, limePulse 3.2s ease-in-out 2s infinite" }}
        />
      ) : null}
    </svg>
  );
}
