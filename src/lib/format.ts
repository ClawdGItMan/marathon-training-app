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
