"use client";

import { useEffect, useRef } from "react";
import { useDashDrawIn } from "./useDashDrawIn";

const VIEWBOX_WIDTH = 340;
const MONO_LABEL = { font: "500 8px var(--font-mono)", letterSpacing: ".12em" };

export type AreaLineChartPoint = { x: number; y: number };

export function AreaLineChart({
  points,
  color = "#C9F53F",
  height,
  fillOpacity = 0,
  gridlines,
  xLabels,
  endDot = true,
  pulseEndDot = false,
  animate = true,
}: {
  points: AreaLineChartPoint[];
  color?: string;
  height: number;
  fillOpacity?: number;
  gridlines?: { y: number; label: string }[];
  xLabels?: string[];
  endDot?: boolean;
  /** Pulses the endpoint dot (opacity 1 → .45, 3.2s ease-in-out, infinite) — "live now" data per design #7b/#7c. */
  pulseEndDot?: boolean;
  animate?: boolean;
}) {
  const groupRef = useRef<SVGGElement>(null);
  const lineRef = useRef<SVGPolylineElement>(null);
  const filled = fillOpacity > 0;

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const polygonPoints = first && last
    ? `${first.x},${height} ${polylinePoints} ${last.x},${height}`
    : polylinePoints;

  // Filled mode keeps the approved single-<g> synchronized wipe: the JSX style
  // starts it on first paint; only override for the reduced-motion /
  // non-animated case (fill+line fully visible, no clip, no animation).
  useEffect(() => {
    const g = groupRef.current;
    if (!filled || !g) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || prefersReducedMotion) {
      g.style.animation = "none";
      g.style.clipPath = "inset(0 0 0 0)";
    }
  }, [filled, animate, polylinePoints]);

  // Pure-line mode: stroke-dash draw-in (drw pattern from design #7b/#7c).
  useDashDrawIn(lineRef, polylinePoints, !filled, animate);

  const dot = endDot && last ? (
    <circle
      cx={last.x}
      cy={last.y}
      r={filled ? 4.5 : 3}
      fill={color}
      stroke={filled ? "#161b21" : undefined}
      strokeWidth={filled ? 2 : undefined}
      data-anim={pulseEndDot ? "" : undefined}
      style={pulseEndDot ? { animation: "limePulse 3.2s ease-in-out infinite" } : undefined}
    />
  ) : null;

  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        {gridlines?.map((line) => (
          <g key={line.y}>
            <line x1={0} y1={line.y} x2={VIEWBOX_WIDTH} y2={line.y} stroke="var(--hair)" strokeWidth={1} />
            <text x={VIEWBOX_WIDTH - 2} y={line.y - 4} textAnchor="end" style={{ ...MONO_LABEL, fill: "#5c6168" }}>
              {line.label}
            </text>
          </g>
        ))}
        {filled ? (
          <g
            ref={groupRef}
            style={{
              clipPath: "inset(0 100% 0 0)",
              animation: "area-wipe 1.3s .3s ease forwards",
            }}
          >
            <polygon points={polygonPoints} fill={color} fillOpacity={fillOpacity} />
            <polyline
              points={polylinePoints}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {dot}
          </g>
        ) : (
          <>
            <polyline
              ref={lineRef}
              points={polylinePoints}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {dot}
          </>
        )}
      </svg>
      {xLabels ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 4px 0",
            ...MONO_LABEL,
            color: "#5c6168",
          }}
        >
          {xLabels.map((label, i) => (
            <span key={`${label}-${i}`}>{label}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
