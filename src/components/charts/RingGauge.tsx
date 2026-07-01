"use client";

import { useEffect, useRef, type ReactNode } from "react";

const VIEWBOX = 104;
const CENTER = 52;
const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RingGauge({
  value,
  max = 100,
  color,
  size = 104,
  stroke = 8,
  children,
}: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const arcRef = useRef<SVGCircleElement>(null);
  const ratio = max === 0 ? 0 : Math.min(Math.max(value / max, 0), 1);
  const targetOffset = CIRCUMFERENCE * (1 - ratio);

  useEffect(() => {
    const arc = arcRef.current;
    if (!arc) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      arc.style.transition = "none";
      arc.style.strokeDashoffset = String(targetOffset);
      return;
    }

    arc.style.transition = "none";
    arc.style.strokeDashoffset = String(CIRCUMFERENCE);

    const id = requestAnimationFrame(() => {
      arc.style.transition = "stroke-dashoffset 1.3s cubic-bezier(.2,.7,.2,1)";
      arc.style.strokeDashoffset = String(targetOffset);
    });

    return () => cancelAnimationFrame(id);
  }, [targetOffset]);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,.08)"
          strokeWidth={stroke}
        />
        <circle
          ref={arcRef}
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE}
          data-target-offset={targetOffset}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
