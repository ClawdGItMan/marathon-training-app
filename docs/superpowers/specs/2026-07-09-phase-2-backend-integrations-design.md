# Phase 2 — Real Backend & Integrations (Design)

**Date:** 2026-07-09 · **Status:** Approved in brainstorming (5 sections) · **Predecessor:** `2026-07-01-marathon-training-app-design.md` (Phase 1, shipped in PR #1)

## 1. Goal & scope boundary

Replace the Phase-1 seed/localStorage data layer with a real backend and live body-data integrations, without changing a single screen. When Phase 2 is done:

- Recovery ring, vitals, sleep, 7-day recovery show **real Whoop data**, refreshed by a 06:00 America/New_York morning sync and an on-open staleness refresh.
- **Real Strava runs** auto-import via webhook, match planned sessions, mark them completed, and surface in Log's AUTO-IMPORTED · STRAVA section.
- Sign-in exists (single user, email OTP code, allowlisted); all data lives in Supabase Postgres under RLS; the PWA is deployed on Vercel at a real URL and installed on the user's phone.
- **NOT in scope (Phase 3):** AI proposal generation, real coach chat replies, AI onboarding/plan generation, real prediction math, voice input, push notifications. Proposals, coach replies, and the plan remain the seeded content.
- **Plan content decision (user-chosen, option A):** the seeded 16-week demo plan is **re-anchored to real calendar dates** (today = the correct real week/day of Block 2). It is scaffolding until Phase 3's AI onboarding generates the real plan. No plan editor/import is built.

## 2. Architecture (chosen: Approach 1 — Vercel-centric, hybrid sync)

All logic stays in the existing Next.js App Router codebase deployed on Vercel. Supabase provides Postgres + Auth + Storage + RLS only — no Supabase Edge Functions, no second codebase.

Sync is hybrid, three mechanisms:
1. **Morning cron** (Vercel cron → protected route handler) at **06:00 America/New_York** (DST-aware: cron fires hourly at :00 and the handler no-ops unless it is 06:00 in the stored home timezone — this survives DST shifts without cron rewrites). Pulls Whoop recovery/sleep/cycle/workouts and runs a Strava catch-up sweep.
2. **Strava webhook** (route handler): near-real-time run import the moment Strava receives an activity. Subscription validated at creation; every event verified before processing.
3. **On-open refresh:** when the app loads and the latest snapshot is stale (configurable threshold, default 3h for recovery, 1h for activities), a server action re-syncs. Failures degrade to stale markers, never block render.

The home timezone is a stored setting (default `America/New_York`), editable in Settings; day boundaries for "today" follow it.

## 3. Data model (Supabase Postgres, all tables RLS-locked to `auth.uid()`)

| Table | Holds |
|---|---|
| `profiles` | user row: home timezone, allowlisted email, settings |
| `goals` | race goal (Honolulu 2026-12-13, sub-4:00) |
| `blocks` | training block structure (re-anchored) |
| `planned_sessions` | sessions with structure arrays, dates, status, provenance |
| `proposals` | seeded proposals + decision state (`proposed/accepted/modified/dismissed/expired`), decided_at |
| `pain_areas` / `pain_logs` | body areas, per-log severity/note/timestamps |
| `recovery_snapshots` | Whoop: recovery %, HRV, RHR, sleep stages, efficiency %, sleep score %, day strain — one per day |
| `activities` | unified imported workouts: Strava fields (distance/time/pace/HR) + Whoop fields (strain, avg/max HR, HR-zone durations); provenance flags for which source(s) contributed |
| `run_logs` | RPE + pain check from the Log flow |
| `chat_messages` | coach thread (seeded + user-appended) |
| `integration_tokens` | Whoop/Strava OAuth tokens, **encrypted at rest**, server-only |
| `sync_runs` | audit of each sync attempt (source, ok/error, counts) — powers stale detection |

Zod schemas remain the single source of truth in `src/lib/domain/schemas.ts`; DB rows are parsed through them at the boundary.

## 4. Repo swap & offline behavior

- The existing `Repo` interface (`src/lib/data/repo.ts`) is the seam. A new `supabaseRepo` implements it via Server Actions; `localRepo` is kept for tests/dev-offline mode behind an env flag.
- **Proposal decision semantics move server-side unchanged:** only Accept/Modify mutate the plan; dismiss/override never; accepting/modifying **expires** competing open proposals on the same session; first decided accept/modify wins; moved-session dual-id resolution preserved. Add the **re-decide guard** (final-review §8 debt): a decided/expired proposal cannot be decided again.
- **Offline cache:** last-known Repo reads cached client-side (localStorage, Zod-validated, corrupt→drop); app renders from cache when offline with stale markers, reconciles on reconnect. Writes while offline are rejected calmly with an inline "offline — try again" state (no queue in Phase 2).

## 5. Whoop integration

- OAuth via Whoop developer app (user-owned, free). Settings row → Whoop consent page → callback stores encrypted tokens; auto-refresh; revoke on DISCONNECT.
- Morning sync + on-open refresh pull: **recovery** (score, HRV, RHR), **sleep** (stages, efficiency %, sleep score % — the two remain distinct fields), **cycle** (day strain), **workouts** (sport type, per-workout strain, avg/max HR, HR-zone durations, kilojoules).
- **Strain is data-layer only in Phase 2** (no strain UI exists in the Instrument mocks; "reuse the design exactly" forbids inventing one). It feeds Phase 3's load-aware proposals. It may surface in an existing stat-row slot only if it fits the established pattern exactly — build-time judgment, flagged in review, never a new visual pattern.

## 6. Strava integration

- OAuth via Strava API app (user-owned, free). Same Settings connect/disconnect flow, encrypted tokens, auto-refresh.
- **Webhook:** subscription created programmatically on deploy/setup; validation echo handled; events verified (subscription id + token) then queued to fetch the full activity.
- **Session matching:** an imported run matches a planned session if same local day + session is a run type + not already completed; closest planned distance wins; ties → most specific type. Match ⇒ session `completed` + Log flow surfaces the run for RPE/pain. No match ⇒ activity stored and visible in Log, unattached.
- **Whoop/Strava dedupe:** same physical run recognized by time-window overlap (≥50% overlap of start–end windows); merged into one `activities` row. **Strava is source of truth for distance/pace/route-derived fields; Whoop contributes strain/HR fields.** Non-run Whoop workouts (strength etc.) stored as their own activities.
- Morning catch-up sweep pulls any activities the webhook missed since the last successful sync.

## 7. Auth & security

- **Supabase Auth, email OTP (6-digit code)** — user-chosen over magic link. Allowlist: only the owner's email may sign in (enforced server-side, not just UI). Long-lived sessions per device.
- RLS on every table, keyed to `auth.uid()` — enabled from the first migration.
- Tokens encrypted at rest with app-level AES-256-GCM using a key held only in Vercel env vars (portable, unit-testable, no extension dependency), readable only by server code. Never shipped to the client.
- Webhook endpoints verify origin; cron endpoint requires a bearer secret known only to Vercel cron. All secrets in Vercel env vars; nothing in the repo.
- **Contractor-review flag (standing instruction):** OAuth token handling, webhook verification, and the RLS policies are marked as the priority files for a future contractor/cofounder security review.

## 8. Screens — nothing changes visually; what goes real

| Screen | Real in Phase 2 | Still seeded |
|---|---|---|
| Today | readiness ring + drivers (Whoop), session rows (re-anchored dates), week line (real mileage) | recommendation proposal; PREDICTED line labeled estimate |
| Plan | block on real dates; day-row completion from Strava matches | proposal content |
| Progress | mileage chart, streak, focus ticks from real completions | predictions (labeled) |
| Body | VITALS/SLEEP/RECOVERY·7D from Whoop; pain manager persisted | — |
| Log | AUTO-IMPORTED run is real; RPE/pain saves persist | — |
| Workout Detail | real session/dates; start/complete real | coach-suggests proposal |
| Coach | thread persists server-side | replies (fixed), briefing |
| Settings | live CONNECT/DISCONNECT + status, timezone, sign out | — |

## 9. Error handling

- Integration failure / expired tokens → quiet mono **"STALE — LAST SYNCED {n}h AGO"** marker on affected sections (composed from existing Instrument idioms per spec-1 §11 mandate), never silent zeros or frozen data presented as fresh; Settings shows RECONNECT on the broken row.
- Overnight sync failure → retry on app open; `sync_runs` powers the staleness display.
- Webhook processing is idempotent (same activity delivered twice ⇒ one row).
- All server actions return typed errors rendered as calm inline states; no toast spam.

## 10. Testing

1. **Phase-1 e2e suite (42 tests) stays green throughout** — screens unchanged; it runs against the app in local-repo mode in CI, plus a Supabase-mode smoke pass.
2. **Repo parity suite:** the same behavioral tests (proposal semantics incl. expiry/re-decide guard, provenance, pain logs, session status) run against `localRepo` and `supabaseRepo` (against the local Supabase CLI stack — `supabase start` — so CI needs no cloud project).
3. **Unit:** session matching, dedupe overlap logic, token refresh, DST/timezone day-boundary math, Zod boundary parsing, staleness thresholds.
4. **RLS tests:** anonymous + wrong-user access attempts must be denied at the database.
5. **Integrations mocked** at the HTTP boundary in all automated tests; **one live smoke script per integration** (Whoop, Strava) run manually against real accounts.

## 11. Rollout (each stage ships a working app)

1. Supabase project + migrations + Auth (OTP/allowlist) + `supabaseRepo` swap + Vercel deploy + PWA installed on phone (looks identical to Phase 1, storage is real).
2. Whoop OAuth + morning cron + on-open refresh → rings/vitals/sleep real.
3. Strava OAuth + webhook + matching + dedupe + Log flow → runs real.
4. Stale states, plan re-anchoring, `sync_runs` polish, contractor-review flag docs, final whole-branch review.

## 12. Costs & accounts

- $0 marginal: existing Vercel Pro + paid Supabase; Whoop developer app and Strava API app are free (user creates both with step-by-step guidance — they require his logins). Supabase/Vercel provisioning through connected tooling, confirmed before creating anything.

## 13. Success criteria

1. Morning: readiness ring shows today's real Whoop recovery before 7:00 AM New York time, untouched by hand.
2. A real run uploaded to Strava appears in the app, matched to the day's session, within minutes — and the Log flow is ready with it.
3. Whoop workouts (incl. strain/HR zones) are stored and deduped against Strava runs; strain data queryable for Phase 3.
4. Kill the network: the app still opens with last-known data and honest stale markers; reconnect heals it.
5. Delete the browser profile: sign back in with an emailed code; all data intact (nothing user-generated lives only client-side anymore).
6. All Phase-1 e2e tests pass unmodified; parity suite proves the repo swap is behaviorally invisible; RLS denials verified.
7. Nothing ever changes the plan without an explicit user decision — unchanged and now enforced server-side.
