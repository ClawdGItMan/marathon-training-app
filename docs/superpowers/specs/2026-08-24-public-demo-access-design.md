# Public Demo Access — Design

**Date:** 2026-08-24
**Status:** Approved by Max (option + design approved in session)
**Context:** Portfolio fast-path (decided 2026-08-24): ship the app as a publishable portfolio piece on cloud Supabase + Vercel with demo/seed data, deferring live Whoop/Strava wiring. The app is single-tenant with an owner-only OTP allowlist (`ALLOWED_EMAIL`), so a portfolio visitor would hit an impassable sign-in wall. This feature adds a one-click public demo without weakening the owner's security model.

## Goal

A portfolio visitor clicks **VIEW DEMO** on the sign-in screen and lands in a fully interactive copy of the app (real Supabase backend, seeded demo data). No email, no OTP, one click. The owner's account and data remain untouched and invisible to demo visitors.

## Approach (chosen: real demo account, Option A)

The demo visitor becomes a *genuine signed-in Supabase user* — a second, disposable account — so every existing guarantee (RLS row scoping, server-enforced proposal spine, allowlist middleware) applies to them unchanged. No RLS exceptions, no impersonation seam, no anonymous-session read-redirection.

Rejected alternatives:
- **Anonymous sessions reading the demo user's rows** — requires deliberately breaking the "you only read your own rows" RLS model; unacceptable in an auth surface that was reviewed without such a hole.
- **Separate deploy in `local` repo mode** — zero risk but demonstrates no backend; Max explicitly declined this in favor of showing the full stack.

## Components

### 1. Demo auth account (infrastructure, not code)
- One additional Supabase auth user, created via the Auth admin API (email-confirmed, password sign-in).
- Email: a non-routable demo address (nothing is ever emailed to it). Exact address recorded in env (`DEMO_USER_EMAIL`).
- Password: long random secret, generated at setup, stored **only** in server env (`DEMO_USER_PASSWORD`). Never in the repo, never `NEXT_PUBLIC_*`, never sent to the client.
- Seeded with its own full copy of the demo dataset via the existing generator (`SEED_USER_ID=<demo uuid> SEED_USER_EMAIL=<demo email> npm run db:seed:gen` → apply to cloud DB), same as the owner bootstrap. `profiles` INSERT stays service-role-only (migration 0004) — seeding runs with service role, so no policy change.

### 2. Allowlist extension (`src/lib/auth/allowlist.ts`)
- `isAllowedEmail` currently matches exactly `ALLOWED_EMAIL`. It grows to: match `ALLOWED_EMAIL` **or** `DEMO_USER_EMAIL` (same trim/lowercase normalization; unset `DEMO_USER_EMAIL` ⇒ demo path simply off, owner-only behavior identical to today).
- Both stay server-only env vars; the existing Server-Action pre-check pattern (`checkAllowedEmail` in `src/app/sign-in/page.tsx`) is unchanged and never leaks either address to the client bundle.

### 3. Demo sign-in action + button (`src/app/sign-in/`, `src/components/auth/SignInScreen.tsx`)
- New Server Action `signInAsDemo()`: server-side `signInWithPassword` using `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD` against the same `@supabase/ssr` server client used everywhere else, so session cookies are set through the existing cookie plumbing; then redirect to `/today`.
- If demo env vars are unset or sign-in fails: return the existing sign-in error shape (calm inline error per the app's established error-message idiom) — never a crash, never a hang.
- `SignInScreen` gets one **VIEW DEMO** button under the email field, composed strictly from existing Instrument idioms (mono micro-label styling; no new visual language). In `local` repo mode nothing changes (screen isn't reachable/gated there).

### 4. Demo indicator
- When the signed-in user's email is the demo address, the app header shows a small mono `DEMO` label (Instrument micro-label idiom, same header row as the ASK COACH chip). Owner sessions see nothing new.
- Detection is server-side (session email compared against `DEMO_USER_EMAIL` via a server boundary), consistent with the allowlist's server-only pattern.

### 5. Reset command (`scripts/reset-demo.ts`, `npm run demo:reset`)
- Deletes **only rows whose `user_id` (or `profiles.id`) equals the demo uuid** across all public tables, in FK-safe order, then re-applies the demo seed. Uses the service-role admin client (server/script-only), following the pattern of the existing scripts (`scripts/generate-supabase-seed.ts`, `scripts/reanchor-plan.ts`).
- Manual by design. Scheduled auto-reset is explicitly out of scope (YAGNI at portfolio scale); revisit only if real drift becomes a problem.

## Data flow (demo session)

Visitor → `/sign-in` → **VIEW DEMO** → Server Action `signInAsDemo()` (server-side password grant with env credentials) → session cookies set → redirect `/today` → middleware sees a signed-in, allowlisted user → all reads/writes flow through the existing `supabase-repo` under the demo user's RLS scope. Nothing about the repo seam, screens, or proposal spine changes.

## Error handling

- Demo env vars missing (e.g. a deploy without demo enabled): the **VIEW DEMO button is not rendered at all** (server-side check, same pattern as the allowlist pre-check), and `signInAsDemo` independently refuses with the standard inline error if invoked anyway. This is also what keeps unconfigured environments (CI, local mode) pixel-identical to today.
- `signInWithPassword` failure (bad password after a rotation, Supabase outage): inline error on the sign-in screen using the shared error-message module; no partial session.
- Settings → Connect Whoop/Strava in the demo deployment: provider credentials are intentionally unset in the portfolio fast-path, so the connect flow surfaces its existing polite error. **Accepted** rough edge, documented, not special-cased.
- Hostile/silly writes into the demo account between resets: accepted at portfolio scale; `npm run demo:reset` is the remedy.

## Security posture (explicit)

- No RLS policy changes. No new service-role code paths reachable from the client. The only trust change is the allowlist accepting a second, disposable identity.
- The demo password is a server secret; the visitor's browser only ever receives ordinary session cookies for the demo user.
- The demo user can do exactly what any signed-in user can do, scoped to their own rows — including hitting API routes (cron is `CRON_SECRET`-gated; webhook validates Strava subscription id; both unaffected).
- **Flag:** this touches the auth surface. Add the new/changed files (`allowlist.ts`, demo sign-in action, `reset-demo.ts`) to `docs/security-review-priorities.md` as needs-contractor-review before the app is ever more than a portfolio/personal tool.

## Testing

- Unit (vitest): allowlist accepts owner + demo, rejects others and unset-demo config; `signInAsDemo` error paths (missing env, failed sign-in); demo-indicator visibility logic.
- Stack-backed (existing parity/RLS harness): demo user cannot read or write owner rows (cross-user denial with the *real* second user, strengthening the existing RLS assertions); reset script wipes demo rows and leaves owner rows untouched.
- e2e: Phase-1 local-mode baseline (46+1) must remain byte-identical in behavior — local mode gates all of this off. Supabase-mode smoke gains a demo-button path check.
- Whole existing suite (399 unit / 38 stack-backed) stays green.

## Out of scope

- Scheduled/automatic demo resets.
- Rate limiting or abuse hardening beyond what exists.
- Hiding/disabling Settings connect buttons in demo.
- Whoop/Strava live wiring (separate deferred thread).
- Read-only demo mode (Max chose fully interactive + reset).
