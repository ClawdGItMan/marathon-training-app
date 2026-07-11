# Security review priorities

This app has not had a human security review — everything below was built
by AI tooling under an AI-controller process (see `.superpowers/sdd/`), not
audited by a second engineer. This is a flag list for that future review
(a contractor or a future cofounder), not a review itself: exactly the
files that make up this app's security-sensitive surface, and the one
question a reviewer must answer for each. Ordered by blast radius (secrets
and auth first, then the DB policies that back every other table, then the
narrower single-purpose surfaces).

| File | What a reviewer must check |
|---|---|
| `src/lib/crypto/token-cipher.ts` | AES-256-GCM at rest for OAuth tokens: confirm the IV is fresh-random per encrypt call (never reused/derived), the auth tag is verified on every decrypt (tampered ciphertext must throw, not silently return garbage), and `TOKEN_ENCRYPTION_KEY` is never logged, defaulted, or accepted at any length other than exactly 32 bytes. |
| `src/lib/integrations/oauth.ts` | Shared OAuth plumbing for both providers: the CSRF `state` cookie is `httpOnly`/`secure`(prod)/`sameSite=lax` and is read-and-cleared exactly once per callback (single-use, even on a failed exchange — replay of an old callback URL must fail); the `state` comparison (`assertState`) is timing-safe; `integration_tokens` reads/writes go through `getAdminClient()` only (never a user-scoped client) since that table has no RLS policies for `authenticated`/`anon` — see the migration row below. |
| `src/app/api/integrations/whoop/callback/route.ts`, `src/app/api/integrations/strava/callback/route.ts` | Both are thin wrappers around `handleCallback` in oauth.ts — confirm they add nothing bespoke that could reintroduce a state/CSRF bug (they shouldn't: verify no divergence crept in between the two providers), and that an unauthenticated callback hard-401s rather than silently proceeding. |
| `src/app/api/webhooks/strava/route.ts` | Public, unauthenticated-by-Supabase-session endpoint (Strava calls it directly): confirm the `hub.challenge` GET echo only responds when `hub.verify_token` matches `STRAVA_WEBHOOK_VERIFY_TOKEN` exactly, the POST handler validates `subscription_id` against `STRAVA_SUBSCRIPTION_ID` before doing anything with the payload, and that the "always ACK 200" strategy (by design — see the route's header comment) never leaks whether a given `owner_id`/user mapping exists to an unauthenticated caller via response-shape or timing differences. |
| `supabase/migrations/0001_schema.sql` | The RLS foundation every other table's safety depends on: confirm every table has `enable row level security` AND a matching `for all using/with check (auth.uid() = ...)` policy (the "`<t>_own`" pattern) with no gaps, that `integration_tokens` is the sole deliberate exception (RLS enabled, zero policies — service-role-only by construction, not by omission), and that the `grant`/`alter default privileges` block doesn't hand `authenticated` anything beyond the intended select/insert/update/delete (no `truncate`/`references`/`trigger`, no table-level bypass of the row-level policies above it). |
| `supabase/migrations/0002_payload_columns.sql` | Purely additive (`alter table ... add column payload jsonb not null default '{}'` on three tables already covered by 0001's grants/RLS) — confirm it really is additive with no grant/policy changes smuggled in, since a migration that *looks* like a no-op is exactly where a reviewer's guard drops. |
| `supabase/migrations/0003_decide_proposal.sql` | The proposal-decision RPC — confirm it is `security invoker` (not `definer`, which would run with elevated privileges and bypass the caller's own RLS scoping) so a proposal/session belonging to another user stays invisible to it exactly as a direct query would; confirm the re-decide guard (`status <> 'proposed'` raises) can't be raced (row is `select ... for update`-locked first) and that the decision-string allowlist (`accepted`/`modified`/`dismissed`/`overridden`) rejects anything else rather than silently no-op'ing. |
| `src/middleware.ts` + `src/lib/auth/allowlist.ts` | The whole app's access gate: confirm `isAllowedEmail` is only ever called server-side (never bundled client-side, which would expose the allowlisted address), that the middleware's mode gate (`NEXT_PUBLIC_REPO_MODE !== "supabase"` → no-op) can't be flipped by a client-controlled value at runtime (it's a build/deploy-time env var, not request input — confirm that stays true), and that every non-public path redirects to `/sign-in` on both "no session" and "session but not the allowlisted email" (the latter also force-signs-out, confirm that call can't be skipped). |
| `src/lib/supabase/admin.ts` | The service-role client: confirm every call site is a cron job, webhook handler, or OAuth callback's token read/write — i.e. genuinely has no user session to scope against — and never a user-driven request path (grep for `getAdminClient` importers whenever this list goes stale; a new importer from a user-facing Server Action/route is the exact regression this file's own header comment warns about). |
| `src/app/api/cron/morning/route.ts` | Confirm the `authorization: Bearer ${CRON_SECRET}` check runs before any DB access (it does — first line of `GET`), the comparison is timing-safe, and that `CRON_SECRET` is never derivable/guessable from anything client-visible (it's a plain server env var — confirm it never leaks into a `NEXT_PUBLIC_*` var or a client-bundled response). |

## Out of scope for this list

Everything above is what changed/was added for the Whoop/Strava/Supabase
backend (Phase 2). It does not re-review Phase-1 UI code, the design
system, or anything that was already shipped and reviewed before this
plan started.
