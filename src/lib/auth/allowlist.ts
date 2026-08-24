/**
 * Single-email allowlist gate, plus the demo account. `ALLOWED_EMAIL` and
 * `DEMO_USER_EMAIL` are plain (non-`NEXT_PUBLIC_`) server env vars, so these
 * functions must only ever run server-side (middleware, Server Actions) —
 * never imported directly into a client component. The sign-in screen's
 * client-side pre-check goes through the `checkAllowedEmail` Server Action
 * defined in `src/app/sign-in/page.tsx`, which calls this on the server and
 * returns only a boolean, so neither address is ever bundled into client JS.
 *
 * `DEMO_USER_EMAIL` unset ⇒ `isDemoEmail` matches nothing and the allowlist
 * behaves exactly as before (owner-only) — the demo feature is opt-in per
 * environment (see docs/superpowers/specs/2026-08-24-public-demo-access-design.md).
 */

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function isDemoEmail(email: string): boolean {
  const demo = process.env.DEMO_USER_EMAIL;
  if (!demo || !email) return false;
  return normalize(email) === normalize(demo);
}

export function isAllowedEmail(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAIL;
  if (allowed && normalize(email) === normalize(allowed)) return true;
  return isDemoEmail(email);
}
