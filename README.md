# Marathon Training App

## Overview
A dark, editorial-styled running/marathon training app. This bundle documents the full set of core screens — **Progress, Recovery, Plan, Log, Strength**, a **Daily** home screen, and the headline feature: a **Runna-inspired Workout Detail** view (session structure breakdown + AI-suggested alternative). The visual system is calm and text-forward: near-black backgrounds, one structural accent, per-session-type accent colors, generously rounded cards, and a background-free tab bar.

## Development

> **This entire document describes the original v1 design system (Archivo font, `#3866e0` accent, rounded cards) and is superseded.** The app now implements the **"Instrument"** design system — near-black graphite, hairline rules instead of cards, one lime (`#C9F53F`) signal color, mono micro-labels, tabular numerals, a text-only tab bar. **`design-v2/` (`design-v2/README.md` + `design-v2/Daily Screen Directions.dc.html`) is the canonical design reference** for every screen; this root file is kept for historical/structural context only (interactions, state shape, data needs) — do not follow its color/typography tokens.

Commands:
- `npm run dev` — start the dev server (http://localhost:3000)
- `npm run build` — production build
- `npx tsc --noEmit` — type-check (strict)
- `npx vitest run` — unit tests
- `PLAYWRIGHT_TEST=1 npx playwright test` — e2e tests (stop any manually-running `npm run dev` first — without `PLAYWRIGHT_TEST=1` the dev overlay intercepts clicks and e2e tests flake)

### Phase 2 (Supabase backend)

Phase 1 is a localStorage-only prototype. Phase 2 adds a real Supabase
backend (Postgres + Auth, RLS on every table) plus live Whoop/Strava sync,
switchable via `NEXT_PUBLIC_REPO_MODE` without touching any screen — see
`docs/superpowers/specs/2026-07-09-phase-2-backend-integrations-design.md`
for the full design and `docs/security-review-priorities.md` for the
security-sensitive surface a future reviewer should look at first.

**Local Supabase stack**
- `npx supabase start` — boots the local stack (Postgres, Auth, Studio) via Docker; `npx supabase stop` to tear it down.
- `npx supabase db reset` (or `npm run db:reset`) — drops and recreates the local DB from `supabase/migrations/*.sql`, then loads `supabase/seed.sql`. Run this after pulling a new migration or editing the seed.
- `npm run db:seed:gen` — regenerates `supabase/seed.sql` from the Phase-1 TypeScript seed (`src/lib/data/seed.ts`); run after editing that seed, then `db reset` to load it.
- `npm run test:supabase` — the stack-backed parity/RLS suites (`tests/**/*.supabase.test.ts`). Each file runs its own `db reset` in `beforeAll`, so this is serial and slow (minutes) by design — never parallelized (see `vitest.supabase.config.ts`). Requires the local stack running first.

**Repo modes** — `NEXT_PUBLIC_REPO_MODE` (env var, defaults to `local`):
- `local` — Phase-1 localStorage repo (`src/lib/data/local-repo.ts`). No Supabase, no auth gate (`src/middleware.ts` no-ops entirely in this mode). This is what the default/CI Playwright run (`PLAYWRIGHT_TEST=1 npx playwright test`, 42 tests) exercises.
- `supabase` — real backend (`src/lib/data/supabase-repo.ts`), RLS-scoped reads/writes via the signed-in user, auth gate active. Switch by setting `NEXT_PUBLIC_REPO_MODE=supabase` (plus the Supabase env vars below) and restarting the dev server. The env-gated e2e smoke (below) runs the app in this mode automatically; it isn't something you flip for the default test run.

**Env vars** (see `.env.example`; all server-only vars except the `NEXT_PUBLIC_*` ones, which are client-safe by Next.js convention):

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project/local-stack API URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | RLS-scoped anon key — safe client-side. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS — server-only, cron/webhook/OAuth-callback code paths exclusively (see `src/lib/supabase/admin.ts`). |
| `SUPABASE_DB_URL` | Tests only (direct `psql`/pg access for stack-backed suites). |
| `TOKEN_ENCRYPTION_KEY` | Base64, must decode to exactly 32 bytes. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `CRON_SECRET` | Bearer token the morning cron route requires. |
| `ALLOWED_EMAIL` | The single allowlisted sign-in address (`src/lib/auth/allowlist.ts`) — this app is single-tenant by design. |
| `NEXT_PUBLIC_REPO_MODE` | `local` \| `supabase` — see Repo modes above. |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | Whoop developer app credentials. |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Strava API app credentials. |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Shared secret Strava echoes back on webhook subscription validation. |
| `STRAVA_SUBSCRIPTION_ID` | Set AFTER registering the webhook (below) — not known upfront. The webhook route validates every incoming event's `subscription_id` against this. |
| `NEXT_PUBLIC_APP_URL` | This app's public base URL — used to build OAuth redirect URIs and the webhook `callback_url`. |

**Cloud bootstrap (⚑ Stage-1 checkpoint — run once per deployed environment, in this order)**

Signing in does **not** create a `profiles` row — an OTP sign-in creates only the `auth.users` row, and `profiles` INSERT is service-role-only (migration `0004_profiles_insert_lockdown.sql`), so a freshly-deployed app renders nothing until the owner's profile and demo data are seeded against their real auth uuid:

1. Deploy the app with all env vars set (`NEXT_PUBLIC_REPO_MODE=supabase`, `ALLOWED_EMAIL=<owner email>`, the Supabase keys above).
2. The owner signs in once via the deployed app's OTP flow (this creates only their `auth.users` row).
3. Capture the owner's auth uuid: Supabase dashboard → **Authentication** → Users → copy the `UID` for that email.
4. `SEED_USER_ID=<uuid> SEED_USER_EMAIL=<owner email> npm run db:seed:gen` — with `SEED_USER_ID` set the generator skips the `auth.users` insert (the real auth user already exists) and writes **`supabase/seed.cloud.sql`** (a separate file — the local `supabase/seed.sql` is never touched; `seed.cloud.sql` is gitignored since it embeds the owner's uuid/email).
5. Run it against the cloud DB: `psql "$SUPABASE_DB_URL" -f supabase/seed.cloud.sql` (or paste into the Supabase SQL editor).
6. Then connect Whoop/Strava from Settings and (optionally) re-anchor the plan: `SEED_USER_ID=<uuid> SEED_USER_EMAIL=<owner email> npx tsx scripts/reanchor-plan.ts` emits `supabase/reanchor-update.sql` scoped to that same uuid (see Re-anchoring below).

Without step 4–5, a signed-in owner sees a blank app (`getGoal` finds no row) and the OAuth connect flows fail (`integration_tokens` has a foreign key to `profiles`).

**Cron** — `src/app/api/cron/morning/route.ts`, scheduled hourly (`vercel.json`: `0 * * * *`), not once daily at a fixed UTC hour: a UTC-fixed schedule would drift against the profile's home timezone across DST. The route runs every hour and no-ops for a profile unless that profile's LOCAL hour is exactly 6am — the trigger stays pinned to "6am local" year-round while the UTC instant it corresponds to shifts underneath it twice a year.

**Offline shell (service worker)** — `public/sw.js`, registered from the app shell (`src/app/(tabs)/layout.tsx` → `src/lib/sw/register.ts`) in **production builds only**: `next dev` serves JS chunks at stable paths whose contents change on recompile, so the worker's cache-first strategy would serve stale code in dev (this gate is also why the e2e suites, which run against `next dev`, are untouched by it). Strategy: cache-first for `/_next/static/*` + `/icons/*`, network-first with cache fallback for page navigations, and no interception of `/api/*` or any cross-origin (Supabase/provider) request — the app-layer offline cache (`src/lib/data/offline-cache.ts`) owns data. Unit tests cover only the registration gating; the real offline cold-open verification is the ⚑ phone checkpoint (deploy, open the app once, airplane-mode it, reopen — the shell should render with last-known data).

**Strava webhook registration** — `npm run strava:register-webhook` (`scripts/register-strava-webhook.ts`). Run once, manually, after deploying — never in tests/CI. Requires `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`, `STRAVA_WEBHOOK_VERIFY_TOKEN` already set (Strava GETs the callback URL to validate it before the registration POST resolves). Prints the subscription id on success — set that as `STRAVA_SUBSCRIPTION_ID` in the deploy environment.

**Re-anchoring the demo plan** — `npx tsx scripts/reanchor-plan.ts`. The seed's training plan is pinned to a fixed demo week; this re-dates it onto the current real week (preserving weekdays and recomputing the block-week number). **It overwrites `supabase/seed.sql`** and writes `supabase/reanchor-update.sql` (UPDATE statements for an already-seeded cloud DB — run those separately against the deployed project, e.g. via `psql "$SUPABASE_DB_URL" -f supabase/reanchor-update.sql`, or the Supabase SQL editor). For a cloud DB bootstrapped with a real owner (see Cloud bootstrap above), set the same `SEED_USER_ID`/`SEED_USER_EMAIL` when running it so the UPDATEs scope to that uuid instead of the local test account. Run deliberately, not as part of a routine workflow — regenerating `seed.sql` means the next `db reset` loads the re-anchored week, not the original hand-authored one.

**Live smoke scripts** — `npm run smoke:whoop` / `npm run smoke:strava` (`scripts/smoke-whoop.ts` / `scripts/smoke-strava.ts`). Run manually at a ⚑ deploy checkpoint, never in CI: they load the (single) profile's real stored OAuth tokens via the admin client, call each provider's data fetcher(s) once against a recent window, and print the counts. Read-only for business data — no writes to `activities`/`recovery_snapshots`/`planned_sessions` and no `sync_runs` row. The one write a run MAY perform: if the stored access token has expired, the shared auto-refresh path (the same one the cron sync uses) rotates the token pair and re-persists it to `integration_tokens` before retrying — required for crash-safety, since both providers rotate the refresh token on use. Exit 0 on success, 1 on any failure (missing env / not connected / a live API error), with an actionable message identifying which. Both require `NODE_OPTIONS=--conditions=react-server` to run (the npm scripts set this for you — see each script's header comment for why: their import chain crosses `src/lib/supabase/admin.ts`, which is guarded by the `server-only` package).

## About the Design Files
The file in this bundle (`Daily Screen Directions.dc.html`) is a **design reference created in HTML** — a prototype showing intended look and behavior, **not production code to copy directly**. It is authored as a "Design Component" and relies on the bundled `support.js` runtime only so it renders in a browser; **do not port `support.js`** or the `data-screen`/`<x-dc>` scaffolding into your app.

Your task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, native, etc.), using its established component library, tokens, and patterns. If no environment exists yet, choose the most appropriate framework for the project and implement there. Treat the HTML as the source of truth for **exact** colors, spacing, and copy.

### How to read the file
- The HTML is a scrollable "design doc" with commentary. The real UI is inside each phone frame — the element with `data-screen` is the app viewport (a 414px-wide phone). Ignore the surrounding doc chrome (`.dv-turn`, `.dv-opt`, `.dv-olabel`, the intro blurbs).
- Each option has a stable id you can search for: `#3a` Progress, `#3b` Recovery, `#3c` Plan, `#3d` Log, `#3e` Strength, `#5a` Workout Detail. There is also a fully-built interactive Daily screen further down the file.
- Inside a `data-screen`, styling is **inline** and uses a few CSS variables set on the screen root: `--font` (Archivo), `--font-num` (Geist), `--accent` (#3866e0), plus card tokens. On `#5a` the accent variable is named `--brand` (#6E8BEA) and there's a `--warm` (#E8A87C). Resolve these to the literal values in the tokens section below.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are intended to be reproduced pixel-accurately using your codebase's libraries. Where a measurement isn't listed here, read it off the inline styles in the HTML.

---

## Design Tokens

### Typography
- **Display / UI font:** `Archivo` (weights 400–800). Used for titles, labels, body, buttons.
- **Numeric font:** `Geist` (weights 400–700). Used for stat numbers, times, paces, distances (`font-variant-numeric: tabular-nums` on stat grids).
- (The doc chrome also loads Geist Mono / Hanken Grotesk / Space Grotesk — **not** needed in the app.)
- Representative sizes: screen title 22px/700 (26px/700 on Workout Detail hero); section header 12–13px/700 with `letter-spacing:.04–.06em`, uppercase; eyebrow/label 9–11px/700 uppercase `letter-spacing:.10–.13em`; body 11.5–12.5px/400–500; stat number 15–19px/500.

### Color
Backgrounds & surfaces
- App/phone background (radial): `radial-gradient(130% 70% at 50% -8%, #1c232c 0%, #11151b 56%)`
- Card surface: `#171c23`
- Card border: `1px solid rgba(255,255,255,.05)`
- Card radius: **10px** (cards) / **8px** (buttons, tags, toggles, tiles)
- Card shadow: `0 1px 0 rgba(255,255,255,.03) inset, 0 10px 26px -16px rgba(0,0,0,.55)`
- Tab bar top divider: `1px solid rgba(255,255,255,.05)`, tab bar bg `rgba(0,0,0,.22)`

Text
- Primary `#ffffff`, high `#e4e7eb`, medium `#cdd1d6`, secondary `#8a919c`, faint `#7b828c` / `#697079`
- Tab-bar icons/labels (inactive, brightened): `#aab0b8`

Structural accent
- App accent (blue): `#3866e0`
- Workout Detail (`#5a`) uses a softer accent `--brand: #6E8BEA` and a warm effort accent `--warm: #E8A87C`

Session-type / semantic accents
- Easy / aerobic (sky): `#7CB3D9`
- Speed / intervals: `#34B3E6`
- Tempo: `#FFCE3F`
- Long run / success / primary CTA green: `#16e06a`
- Strength (violet): `#9a8cf0`
- Effort / hard (warm orange): `#FF8A3D` (also `#FF9A3D` for smaller warm accents)
- Streak flame: `#FF9A3D`

Negative-delta color scale (used on stat deltas, e.g. HRV `↓12%`)
- The further below 0%, the redder. Stops: **mild −1…−6%** amber `#FFCE3F`/`#FF9A3D` → **moderate −7…−13%** red-orange `#F0603F` → **severe −14%+** full red (`#E5484D`). Positive deltas stay neutral/warm.

### Tab bar (global, all screens)
- 5 items: **TODAY, PLAN, ACTIVITIES/BODY, COACH, LOG** (varies per screen's nav model — see each screen).
- **No background chips** behind icons (neither inactive grey nor active tint). Icons are 22px line/solid glyphs.
- Inactive glyph + label: `#aab0b8`. Active: glyph `#ffffff` (or accent for the COACH/star tab) and label `#ffffff` / accent. Active state is communicated by color only.

---

## Screens / Views
All screens share: a status bar (11:01, signal/wifi/battery), a content area, the tab bar, and a home indicator (130×5px pill, `rgba(255,255,255,.22)`). Phone frame is 414px wide, 40px screen corner radius.

### 1. Progress — `#3a`
- **Purpose:** long-range training progress: goal countdown, mileage trend, race predictions, fitness.
- **Header:** back `‹`, title **Progress**, a **streak pill** (warm flame icon + day count `12`, bg `rgba(255,154,61,.14)`, text `#FF9A3D`, 8px radius), and a **range segmented toggle** `1W · 1M · 3M · 1Y` (active = `3M`; track `rgba(255,255,255,.05)`, active chip `rgba(255,255,255,.1)` + `#fff`, inactive `#7b828c`, 8px radius).
- **YOUR FOCUS card:** eyebrow "YOUR FOCUS" (`#3866e0`), title **Honolulu Marathon**, right-aligned **Dec 13** + "24 WEEKS LEFT"; a segmented progress row (filled ticks accent, empty `rgba(255,255,255,.08)`).
- **THIS WEEK · RUN card:** 3-column stat grid (DISTANCE 32mi / TIME 4:48 / AVG PACE 9:01) over an **area line chart** (green `#16e06a` polyline + soft fill, 20mi/10mi gridlines, MAY–JUL axis; endpoint dot). "12 WEEKS ›" link.
- **PREDICTIONS card:** rows for 5K 21:30 (6:55/mi), 10K 44:50 (7:13/mi), HALF 1:51:20 (8:30/mi), FULL 3:56:10 (vs 4:00 goal). Each row: distance chip (left), time + pace, and a green **▼ delta** (improvement). "30-DAY TREND" label.
- **Nav:** TODAY / PLAN / **COACH**(active in some states) / BODY / LOG.

### 2. Recovery — `#3b`
- **Purpose:** readiness & recovery analytics.
- **Recovery ring:** large score **62** in a circular gauge (amber arc), eyebrow "MODERATE · ↓9" (`#FFCE3F`), headline "Below your 30-day baseline.", supporting copy.
- **VITALS card:** 3-column grid — **HRV 48** with delta **↓12%** rendered red-orange `#F0603F` (per the negative-delta scale); **RESTING HR 52** `↑3`; **RESP RATE 14.2 br**. Below: a full-width **sparkline** (`#7CB3D9`, draw-in animation). "14 DAYS ›".
- **SLEEP card:** **6:12** "of 7:44 need", right "EFFICIENCY 88%", and a stacked stage bar (Deep 1:07 / REM 1:25 / Light 3:08) with legend. "DETAIL ›".
- **RECOVERY · 7 DAYS card:** line chart with per-day dots colored by value (green/amber), T–M axis, "62% avg".

### 3. Plan — `#3c`
- **Purpose:** the training block at a glance, then this week by day.
- **Header:** title **Plan**, subtitle "BLOCK 2 · BUILD · WEEK 7 / 16", an **ASK AI** button (sparkle + accent text).
- **RUN / STRENGTH** segmented tabs.
- **16-WEEK BLOCK card:** periodization bar chart (bars tinted by phase; "peak 52 mi/wk") with BASE / BUILD / PEAK / TAPER labels beneath.
- **THIS WEEK list:** one row per day (MON–SUN): day+date, session name + detail (distance · zone · pace), and a **type tag** colored by session (EASY sky, SPEED, TEMPO, REST, LONG green, etc.). Today's row is highlighted.

### 4. Log — `#3d`
- **Purpose:** fast post-run logging.
- **Auto-imported run card:** Strava-synced summary (icon, "Easy run · 4 mi", "SYNCED" dot), 3-col stats (DISTANCE 4.0mi / TIME 38:24 / AVG PACE 9:36).
- **RPE row:** "HOW HARD? · RPE", value "4 / 10", a 1–10 scale of tiles (selected up-to value in `#7CB3D9`, current solid, rest `rgba(255,255,255,.05)`).
- **Pain check card:** area toggles (Achilles · L / R / Other), severity meter (10 segments, filled to level in `#E8A33A`), and a calm note. Primary **Save log** button (accent, 8px radius, `#fff` text).

### 5. Strength — `#3e`
- **Purpose:** periodized strength tied to the run block.
- **Phase card:** eyebrow "MAX STRENGTH · DELOAD" (violet `#9a8cf0`), note "Volume −20% to match easy running", and a 5-phase mini-progress row (ADAPT / HYPER / MAX● / POWER / MAINT).
- **Session list card:** "WEDNESDAY · LOWER", ~35 min. Exercise rows: each has a check circle, name (+ optional "· ACHILLES" tag `#E8A33A`), a sub-detail, and sets×reps (e.g. Eccentric calf raises 3×12, Back squat 3×5, RDL 3×8, Single-leg press 3×10, Side plank 3×45s). Footer coaching note with sparkle.

### 6. Workout Detail — `#5a`  ⭐ headline feature (Runna-inspired)
Opened by tapping a day/session. Calmer palette: soft blue `#6E8BEA` (structure/assist) + warm apricot `#E8A87C` (effort); flat `#171c23` surfaces (no gradients); 10px cards / 8px controls.
- **Header:** back button (32px, 8px radius, subtle surface), "PLAN · WEDNESDAY" / "JUL 1 · WEEK 7 / 16".
- **Hero:** an **INTERVALS** tag (apricot on `rgba(232,168,124,.14)`, 8px radius), title **Rolling 400s** (700/26px `#fff`), sub "4.5 mi · ~45 min · 3 blocks".
- **BREAKDOWN card** (section header bright white `#fff`): a vertical session structure —
  - **Warm up** — Easy · Zone 2 — 10:00 (blue dot)
  - **8×** repeat block (apricot "8×" + connector line): **400m hard** 5K pace · Zone 5 — 1:32 (apricot time); dashed divider; **200m float** Recovery · easy — 1:05
  - **Cool down** — Easy · Zone 1 — 10:00 (blue dot)
- **SUGGESTED BY AI card** (sparkle + white header; subtle blue border `rgba(110,139,234,.28)`, flat surface): title "Try 5 × 600m instead", rationale copy, three summary chips (`5 × 600m`, `~44 min`, `same Z5 time` — last one apricot), then **Accept suggestion** (soft-blue fill, dark text, 8px) + **Keep original** (ghost, 8px).
- **Start workout** button: full-width, **green `#16e06a`**, dark text `#0e131b`, 8px radius, 50px tall.
- **Nav:** TODAY / PLAN / **COACH**(active) / BODY / LOG.

---

## Interactions & Behavior
- **Range toggle (Progress):** switching 1W/1M/3M/1Y re-scopes the mileage chart & axis; 3M ≈ the shown ~12-week window.
- **Plan RUN/STRENGTH tabs:** switch the plan content between running and strength views.
- **Plan day rows / "tap a day":** open the **Workout Detail** (`#5a`) for that session.
- **Ask AI (Plan):** produces a suggested/adjusted session — the same pattern surfaced inline as the "SUGGESTED BY AI" card in Workout Detail.
- **Accept suggestion (Workout Detail):** replaces the current session's breakdown with the suggested one (e.g. 8×400m → 5×600m); **Keep original** dismisses.
- **Start workout:** enters the live/record workout flow.
- **RPE tiles / pain toggles (Log):** single-select; selected fill uses the accent; **Save log** commits.
- **Charts:** line/area charts have a draw-in animation (`stroke-dashoffset`, ~1.3s ease) on mount — optional to replicate.
- **Negative deltas:** color is a function of magnitude (see scale). Implement as a helper `deltaColor(pct)` so any value auto-picks amber → red-orange → red.

## State Management
- `selectedRange` (Progress): `'1W' | '1M' | '3M' | '1Y'` → drives chart data/axis.
- `planMode` (Plan): `'run' | 'strength'`.
- `selectedDay` / current session → drives Workout Detail contents.
- `suggestionAccepted` (Workout Detail): boolean; swaps breakdown data when true.
- Log form: `rpe` (1–10), `painArea`, `painSeverity` (0–10), sync status.
- Data needs: training plan (blocks/weeks/days/sessions with structure segments), activities (auto-import/Strava), recovery vitals + sleep, race predictions. Sessions carry a **structure array** of segments `{kind: warmup|rep|recovery|cooldown, label, zone, pace, duration, repeat}` — this powers both the breakdown and the structure logic.

## Assets
- **No raster assets required.** All iconography is inline SVG (line/solid, 22px in the tab bar; small glyphs 12–16px). Recreate with your icon library (Lucide/SF Symbols/etc.): flame (streak), sparkle/star (AI), calendar (Plan), figure (Body), book (Support/Log), sun (Today), activity bars, chevrons, check circles.
- Fonts: **Archivo** and **Geist** (Google Fonts / self-host). Fall back to system sans if unavailable.
- Charts are hand-plotted `<polyline>`/gauges in the mock — rebuild with your charting approach; exact point values are in the HTML.

## Files
- `Daily Screen Directions.dc.html` — the design prototype containing every screen (search the ids `#3a`–`#3e`, `#5a`; the interactive Daily screen is lower in the file). **Source of truth for exact values.**
- `support.js` — the browser runtime required only to preview the HTML. **Reference/preview only — do not port.**
