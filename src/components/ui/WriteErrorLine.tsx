import { isNetworkError, OfflineError } from "@/lib/data/offline-cache";

/**
 * One calm inline line for a failed user-triggered write (final-review fix
 * I4) — the SAME Instrument error idiom as the sign-in screen's error line
 * (SignInScreen.tsx: `mt-[10px] font-mono text-[11px] text-ink-2`), reused
 * verbatim rather than inventing a new pattern. No spinners, no toasts.
 *
 * Copy: `OFFLINE — TRY AGAIN` for OfflineError/network-classified failures
 * (the write never reached the server; tapping again when back online is
 * the whole recovery story), `COULDN'T SAVE — TRY AGAIN` for anything else
 * (a server-returned rejection). Renders NOTHING when `error` is null, so
 * screens that never fail (local mode, the e2e baseline) are byte-identical
 * to their pre-I4 rendering.
 */
export function WriteErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  const offline = error instanceof OfflineError || isNetworkError(error);
  return (
    <div className="mt-[10px] font-mono text-[11px] text-ink-2">
      {offline ? "OFFLINE — TRY AGAIN" : "COULDN'T SAVE — TRY AGAIN"}
    </div>
  );
}
