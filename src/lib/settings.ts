const FROM_TABS: Record<string, string> = {
  today: "TODAY",
  plan: "PLAN",
  progress: "PROGRESS",
  body: "BODY",
  log: "LOG",
};

/**
 * Resolves Settings' `?from=` origin (R12 — no v2 mock for this screen).
 * Same convention as Coach's resolver (lib/coach.ts): a recognized tab is
 * both the back target and the ASK COACH context key. Settings' only
 * current entry point is Today's header link (R5), so unknown/absent
 * defaults to Today rather than leaving no way back.
 */
export function resolveSettingsOrigin(from?: string): {
  backHref: string;
  backLabel: string;
  originKey: string;
} {
  const key = from && FROM_TABS[from] ? from : "today";
  return { backHref: `/${key}`, backLabel: FROM_TABS[key], originKey: key };
}
