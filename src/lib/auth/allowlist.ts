/**
 * Single-email allowlist gate. `ALLOWED_EMAIL` is a plain (non-`NEXT_PUBLIC_`)
 * server env var, so this function must only ever run server-side
 * (middleware, Server Actions) — never imported directly into a client
 * component. The sign-in screen's client-side pre-check goes through the
 * `checkAllowedEmail` Server Action defined in `src/app/sign-in/page.tsx`,
 * which calls this function on the server and returns only a boolean, so
 * the allowed address itself is never bundled into client JS.
 */
export function isAllowedEmail(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAIL;
  if (!allowed) return false;
  return email.trim().toLowerCase() === allowed.trim().toLowerCase();
}
