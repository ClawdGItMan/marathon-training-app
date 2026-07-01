import type { SessionType } from "@/lib/domain/types";

const TYPE_COLOR: Record<SessionType, string> = {
  easy: "#7CB3D9",
  speed: "#34B3E6",
  tempo: "#FFCE3F",
  long: "#16e06a",
  strength: "#9a8cf0",
  recovery: "#7CB3D9",
  rest: "#8a919c",
};

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function TypeTag({ type }: { type: SessionType }) {
  const color = TYPE_COLOR[type];
  const background =
    type === "rest" ? "rgba(255,255,255,.05)" : `rgba(${hexToRgb(color)},.16)`;

  return (
    <span
      className="inline-flex items-center rounded-ctl px-2 py-1 font-ui text-[9px] font-bold tracking-[.05em]"
      style={{ backgroundColor: background, color }}
    >
      {type.toUpperCase()}
    </span>
  );
}
