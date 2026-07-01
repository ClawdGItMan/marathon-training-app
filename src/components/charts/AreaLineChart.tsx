"use client";

import { useEffect, useRef } from "react";

const VIEWBOX_WIDTH = 340;

export type AreaLineChartPoint = { x: number; y: number };

export function AreaLineChart({
  points,
  color,
  height,
  fillOpacity = 0.12,
  gridlines,
  xLabels,
  endDot = true,
  animate = true,
}: {
  points: AreaLineChartPoint[];
  color: string;
  height: number;
  fillOpacity?: number;
  gridlines?: { y: number; label: string }[];
  xLabels?: string[];
  endDot?: boolean;
  animate?: boolean;
}) {
  const groupRef = useRef<SVGGElement>(null);

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const polygonPoints = first && last
    ? `${first.x},${height} ${polylinePoints} ${last.x},${height}`
    : polylinePoints;

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The declarative JSX style already starts the wipe on first paint.
    // Only override here for the reduced-motion / non-animated case, where
    // we want the fill+line fully visible with no clip and no animation.
    if (!animate || prefersReducedMotion) {
      g.style.animation = "none";
      g.style.clipPath = "inset(0 0 0 0)";
    }
  }, [animate, polylinePoints]);

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
            <line
              x1={0}
              y1={line.y}
              x2={VIEWBOX_WIDTH}
              y2={line.y}
              stroke="rgba(255,255,255,.05)"
              strokeWidth={1}
            />
            <text
              x={VIEWBOX_WIDTH - 2}
              y={line.y - 4}
              textAnchor="end"
              style={{ font: "600 9px var(--font-num)", fill: "#697079" }}
            >
              {line.label}
            </text>
          </g>
        ))}
        <g
          ref={groupRef}
          style={{
            clipPath: "inset(0 100% 0 0)",
            animation: "area-wipe 1.3s .3s ease forwards",
          }}
        >
          <polygon
            points={polygonPoints}
            fill={color}
            fillOpacity={fillOpacity}
          />
          <polyline
            points={polylinePoints}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {endDot && last ? (
            <circle
              cx={last.x}
              cy={last.y}
              r={4.5}
              fill={color}
              stroke="#161b21"
              strokeWidth={2}
            />
          ) : null}
        </g>
      </svg>
      {xLabels ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 4px 0",
          }}
        >
          {xLabels.map((label, i) => (
            <span
              key={`${label}-${i}`}
              style={{ font: "700 9px var(--font-ui)", color: "#697079" }}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
