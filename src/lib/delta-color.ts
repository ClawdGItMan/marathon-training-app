export function deltaColor(pct: number): string {
  if (pct >= 0) return "#8a919c";
  if (pct >= -3) return "#FFCE3F";
  if (pct >= -6) return "#FF9A3D";
  if (pct >= -13) return "#F0603F";
  return "#E5484D";
}
