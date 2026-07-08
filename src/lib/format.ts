export function formatPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60), s = Math.round(secPerMi % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
export function formatHM(totalMin: number): string {
  const h = Math.floor(totalMin / 60), m = Math.round(totalMin % 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}
export function formatClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = Math.round(totalSec % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
/** 14400 → "4:00" (goal time in h:mm, design #7b "vs 4:00 goal"). */
export function formatGoalHM(totalSec: number): string {
  const h = Math.floor(totalSec / 3600), m = Math.round((totalSec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
/** −132 → "−2:12" (prediction delta, U+2212 minus per design #7b). */
export function formatDeltaMSS(deltaSec: number): string {
  const abs = Math.abs(deltaSec);
  const sign = deltaSec < 0 ? "−" : "+";
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
/** "2026-07-01" → "WED · JUL 1" (page-header date context, design #7c). */
export function formatDayContext(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${weekday} · ${month} ${date.getDate()}`;
}
/** 62 → "MODERATE" (recovery-score band, design #7c hero: MODERATE · ↓9). */
export function recoveryBand(pct: number): string {
  if (pct >= 80) return "HIGH";
  if (pct >= 60) return "MODERATE";
  return "LOW";
}
/** block {2, BUILD, 7, 16} → "BLOCK 2 · BUILD · WK 07/16" (Plan header sub, design #7a). */
export function formatBlockSub(block: {
  number: number;
  phase: string;
  week: number;
  totalWeeks: number;
}): string {
  return `BLOCK ${block.number} · ${block.phase} · WK ${String(block.week).padStart(2, "0")}/${block.totalWeeks}`;
}
/** "2026-06-29" → { weekday: "MON", day: "29" } (Plan week-row label, design #7a). */
export function formatWeekDayLabel(iso: string): { weekday: string; day: string } {
  const date = new Date(`${iso}T00:00:00`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const day = String(date.getDate()).padStart(2, "0");
  return { weekday, day };
}
