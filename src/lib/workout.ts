import type { SessionType, StructureSegment } from "@/lib/domain/types";

export type BreakdownBlock =
  | { kind: "single"; segment: StructureSegment }
  | { kind: "repFloat"; rep: StructureSegment; float: StructureSegment };

/**
 * Groups a session's flat structure array into the visual blocks the
 * Workout Detail BREAKDOWN renders (design-v2 #6a): a rep segment
 * immediately followed by a recovery segment collapses into one block
 * (lime "8×" row + dashed-divider float row); everything else (warmup,
 * cooldown) is its own row. The resulting block count is also the
 * hero's BLOCKS stat (3 for wed-400s: warm up / interval set / cool down).
 */
export function groupBreakdown(structure: StructureSegment[]): BreakdownBlock[] {
  const blocks: BreakdownBlock[] = [];
  for (let i = 0; i < structure.length; i++) {
    const segment = structure[i];
    const next = structure[i + 1];
    if (segment.kind === "rep" && next?.kind === "recovery") {
      blocks.push({ kind: "repFloat", rep: segment, float: next });
      i++;
      continue;
    }
    if (segment.kind === "recovery") continue; // consumed above; orphaned recovery is dropped
    blocks.push({ kind: "single", segment });
  }
  return blocks;
}

// Category label shown next to the hero's pulsing dot (design #6a: "INTERVALS"
// for the speed/wed-400s session). Only "speed" is confirmed by the mock —
// the rest are a reasonable extrapolation so the screen degrades sensibly
// for other session types that don't have a dedicated #6a mock.
const CATEGORY_LABELS: Record<SessionType, string> = {
  speed: "INTERVALS",
  tempo: "TEMPO",
  easy: "EASY RUN",
  long: "LONG RUN",
  rest: "REST",
  strength: "STRENGTH",
  recovery: "RECOVERY",
};

export function categoryLabel(type: SessionType): string {
  return CATEGORY_LABELS[type];
}
