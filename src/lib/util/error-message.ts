/**
 * Extracts a human-readable message from a caught value: an `Error`'s
 * `.message`, a Postgrest-style error object's `.message` (supabase-js
 * query failures throw/reject with plain `{message, code, details, hint}`
 * objects, NOT `Error` instances — the bare `err instanceof Error ?
 * err.message : String(err)` pattern silently degrades those to the
 * useless string "[object Object]"), or `String(err)` as a last resort.
 *
 * Shared home (final-review fix M1): originally lived in
 * scripts/lib/smoke.ts (which now re-exports from here); the whoop/strava
 * sync orchestrators and the Strava webhook route use it for every
 * `sync_runs.detail` they write, so a live failure is always diagnosable
 * from the row it leaves behind.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return String(err);
}
