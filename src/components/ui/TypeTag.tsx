import type { SessionType } from "@/lib/domain/types";

/**
 * Instrument session-type label: mono uppercase grey text, no chip
 * background, no per-type colors — type does the hierarchy work, not color.
 * Design ref: design-v2/README.md §Typography ("no colored tags or chips")
 * and #7a week rows (EASY/SPEED/TEMPO/REST/LONG in grey mono).
 */
export function TypeTag({ type, dim = false }: { type: SessionType; dim?: boolean }) {
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-[.14em] whitespace-nowrap ${
        dim ? "text-[#3f444b]" : "text-[#5c6168]"
      }`}
    >
      {type.toUpperCase()}
    </span>
  );
}
