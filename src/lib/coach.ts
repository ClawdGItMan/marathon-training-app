const FROM_TABS: Record<string, string> = {
  today: "TODAY",
  plan: "PLAN",
  progress: "PROGRESS",
  body: "BODY",
  log: "LOG",
};

/**
 * Resolves Coach's `?from=` origin (design #7f BACK button + context-line
 * seeding, R11 brief). `backHref` always resolves to a real tab, defaulting
 * to `/today` for a missing/unrecognized `from`. `contextLabel` is only set
 * for a recognized tab — unknown/absent means no transcript context line at
 * all, per the brief ("unknown/absent → no line").
 */
export function resolveCoachOrigin(from?: string): {
  backHref: string;
  contextLabel?: string;
} {
  const contextLabel = from ? FROM_TABS[from] : undefined;
  const backKey = contextLabel ? from! : "today";
  return { backHref: `/${backKey}`, contextLabel };
}

/**
 * Phase-1 has no live coaching backend: sending a message round-trips
 * through the repo overlay with this fixed reply (design brief: "Phase-1
 * send behavior unchanged (fixed offline reply, persisted)"). R11 restyles
 * the screen only — this copy is new (no prior Coach screen existed to
 * carry it forward from).
 */
export const OFFLINE_REPLY =
  "Noted — I'll factor that into your next few sessions.";

/** "11:01" style clock label for a chat message (design #7f "COACH · 11:01"). */
export function chatTime(date: Date = new Date()): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}
