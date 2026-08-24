# Phase 2 — Real Backend & Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase-1 localStorage seed repo with Supabase (Postgres/Auth/RLS) and live Whoop + Strava integrations, without changing any screen.

**Architecture:** All logic stays in the Next.js app on Vercel (spec Approach 1). Supabase = Postgres + Auth + RLS only. `Repo` interface is the seam: a new `supabaseRepo` (browser Supabase client + one Postgres RPC for proposal decisions) sits behind an env-selected `repo` export. Sync is hybrid: hourly Vercel cron whose handler no-ops except at 06:00 home-timezone, a Strava webhook, and an on-open staleness refresh.

**Tech Stack:** Next.js 16 App Router, TS strict, Zod 4 (single source of truth), @supabase/supabase-js + @supabase/ssr, Supabase CLI local stack for tests, Vitest + RTL, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-09-phase-2-backend-integrations-design.md` — binding. Phase-1 design spec still governs all visuals: **screens change zero pixels**; new UI (sign-in, stale markers, connect rows) composes ONLY from existing Instrument idioms (hairline rules, mono 10px/.18em labels #9aa0a7, lime #C9F53F strictly "now/act/current", Space Grotesk/Geist Mono/Geist, 2px radius).
- Proposal spine (unchanged, now server-enforced): only accept/modify mutate the plan; dismiss/override never; accept/modify **expires** competing open proposals on the same session; a decided/expired proposal can never be re-decided; provenance `original|accepted-proposal|modified-proposal`; moved-session dual-id resolution preserved.
- RLS on every table from the first migration, keyed to `auth.uid()`. No table without a policy.
- Secrets only in env vars. Env names (exact): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (tests only), `TOKEN_ENCRYPTION_KEY` (base64, 32 bytes), `CRON_SECRET`, `ALLOWED_EMAIL`, `NEXT_PUBLIC_REPO_MODE` (`local`|`supabase`), `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `NEXT_PUBLIC_APP_URL`.
- Client code may hold only `NEXT_PUBLIC_*` values. `SUPABASE_SERVICE_ROLE_KEY` is used ONLY in cron/webhook route handlers (no user session there); all user-driven reads/writes go through the RLS-scoped browser client.
- Zod parse at every boundary: DB row → domain type, external API JSON → domain type. Domain schemas live in `src/lib/domain/schemas.ts`; DB/API wire schemas live next to their client.
- Home timezone: stored in `profiles.home_timezone`, default `America/New_York`. All "today"/day-boundary math uses it via the helpers in Task 9 — never `new Date()` locale defaults.
- Staleness thresholds: recovery > 3h, activities > 1h (exported constants `STALE_RECOVERY_MS`, `STALE_ACTIVITIES_MS` in `src/lib/sync/staleness.ts`).
- Components under 150 lines; conventional commits; TDD every task; the Phase-1 e2e suite (42 tests, local-repo mode) must pass at the end of EVERY task: `PLAYWRIGHT_TEST=1 npx playwright test`.
- Vitest tests that need the local Supabase stack are named `*.supabase.test.ts` and run via `npm run test:supabase` (Task 1 wires this); plain `npx vitest run` must keep passing without Supabase running.
- Whoop API v2 (v1 is retired): base `https://api.prod.whoop.com/developer/v2`, OAuth authorize `https://api.prod.whoop.com/oauth/oauth2/auth`, token `https://api.prod.whoop.com/oauth/oauth2/token`, scopes `read:recovery read:sleep read:workout read:cycles read:profile offline`. Verify exact response shapes against https://developer.whoop.com docs at implementation time; wire schemas in this plan are the contract to fill, not to trust blindly.
- Strava API v3: OAuth authorize `https://www.strava.com/oauth/authorize`, token `https://www.strava.com/oauth/token`, scope `activity:read_all`, API base `https://www.strava.com/api/v3`, webhooks per https://developers.strava.com/docs/webhooks (GET validation echoes `hub.challenge`).
- Controller checkpoints (cloud project creation, Vercel env/deploy, Whoop/Strava dev-app creation, webhook registration) are NOT subagent work — they are marked ⚑ and executed by the controller/user between tasks.

## File Map

```
supabase/config.toml                    # CLI local stack (Task 1)
supabase/migrations/0001_schema.sql     # tables + RLS (Task 1)
supabase/migrations/0002_decide_proposal.sql  # RPC (Task 4)
supabase/seed.sql                       # generated from TS seed (Task 1)
scripts/generate-supabase-seed.ts       # TS seed -> SQL (Task 1)
scripts/reanchor-plan.ts                # date re-anchoring (Task 13)
scripts/smoke-whoop.ts, smoke-strava.ts # live smoke (Task 14)
src/lib/supabase/browser.ts             # RLS browser client singleton
src/lib/supabase/server.ts              # SSR server client (auth flows)
src/lib/supabase/admin.ts               # service-role client (cron/webhook ONLY)
src/lib/data/index.ts                   # env-selected `repo` export (Task 3)
src/lib/data/supabase-repo.ts           # Repo impl (Tasks 3-4)
src/lib/data/row-mappers.ts             # DB row <-> domain (Zod) (Task 3)
src/lib/data/offline-cache.ts           # last-known cache (Task 5)
src/lib/auth/allowlist.ts, middleware.ts, sign-in screen (Task 2)
src/lib/crypto/token-cipher.ts          # AES-256-GCM (Task 6)
src/lib/integrations/oauth.ts           # shared OAuth helpers (Task 6)
src/lib/integrations/whoop/{client,sync,wire}.ts   (Tasks 7-8)
src/lib/integrations/strava/{client,sync,wire}.ts  (Tasks 10-11)
src/lib/sync/{staleness,timezone,run}.ts           (Tasks 8-9)
src/lib/activities/{matching,dedupe}.ts            (Task 11)
src/app/api/cron/morning/route.ts       # cron (Task 9)
src/app/api/webhooks/strava/route.ts    # webhook (Task 11)
src/app/api/integrations/{whoop,strava}/{connect,callback}/route.ts (Tasks 7,10)
src/app/sign-in/page.tsx                # OTP screen (Task 2)
src/components/sync/StaleMarker.tsx     # mono stale line (Task 12)
tests/parity/repo-parity.ts             # shared behavioral suite (Task 3)
tests/unit/*.supabase.test.ts           # stack-backed tests
```

Stage boundaries: Tasks 1–5 = Stage 1 (backend + swap), 6–9 = Stage 2 (Whoop), 10–11 = Stage 3 (Strava), 12–14 = Stage 4 (polish).

---

### Task 1: Supabase local stack, full schema migration, RLS, seed generation

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `supabase/migrations/0001_schema.sql`, `scripts/generate-supabase-seed.ts`, `supabase/seed.sql` (generated), `tests/unit/schema.supabase.test.ts`
- Modify: `package.json` (scripts + devDeps), `.gitignore` (`supabase/.temp`), `.env.example` (all env names from Global Constraints, no values)

**Interfaces:**
- Consumes: `src/lib/domain/schemas.ts` types; `src/lib/data/seed.ts` seed object.
- Produces: the 12 tables below with exact column names; `npm run db:start|db:reset|test:supabase` scripts; a deterministic seed for user id `00000000-0000-0000-0000-000000000001` (TEST_USER_ID, exported from `tests/parity/constants.ts`).

- [ ] **Step 1:** `npm i -D supabase && npx supabase init`. Add scripts: `"db:start": "supabase start"`, `"db:reset": "supabase db reset"`, `"test:supabase": "vitest run --dir tests --include '**/*.supabase.test.ts'"`. Exclude `*.supabase.test.ts` from the default vitest include in `vitest.config.ts`.
- [ ] **Step 2:** Write `supabase/migrations/0001_schema.sql`. Exact DDL (types simplified to what the domain schemas need; every table gets the same RLS pattern):

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  home_timezone text not null default 'America/New_York',
  created_at timestamptz not null default now()
);
create table goals (
  id text primary key, user_id uuid not null references profiles(id) on delete cascade,
  name text not null, date date not null, target_seconds int not null
);
create table blocks (
  id text primary key, user_id uuid not null references profiles(id) on delete cascade,
  label text not null, phase text not null, week int not null, total_weeks int not null,
  periodization jsonb not null
);
create table planned_sessions (
  id text not null, user_id uuid not null references profiles(id) on delete cascade,
  date date not null, title text not null, type text not null, detail text,
  structure jsonb not null default '[]', status text not null default 'planned',
  provenance text not null default 'original', payload jsonb not null,
  primary key (user_id, id)
);
create table proposals (
  id text not null, user_id uuid not null references profiles(id) on delete cascade,
  scope text not null, session_id text not null, status text not null default 'proposed',
  decided_at timestamptz, payload jsonb not null,
  primary key (user_id, id)
);
create table pain_areas (
  id text not null, user_id uuid not null references profiles(id) on delete cascade,
  name text not null, severity int not null, trend text not null, payload jsonb not null,
  primary key (user_id, id)
);
create table pain_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  area_id text not null, severity int not null check (severity between 0 and 10),
  note text, logged_at timestamptz not null default now()
);
create table recovery_snapshots (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null, recovery_pct int, hrv_ms numeric, rhr int, day_strain numeric,
  sleep jsonb, source text not null default 'whoop', synced_at timestamptz not null default now(),
  primary key (user_id, day)
);
create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  strava_id bigint unique, whoop_id text unique,
  sport text not null, started_at timestamptz not null, ended_at timestamptz not null,
  distance_m numeric, moving_sec int, avg_pace_sec_per_mi numeric,
  avg_hr int, max_hr int, strain numeric, hr_zones jsonb,
  matched_session_id text, payload jsonb not null default '{}'
);
create table run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  session_id text, activity_id uuid references activities(id),
  rpe int not null check (rpe between 1 and 10), pain jsonb, logged_at timestamptz not null default now()
);
create table chat_messages (
  id text not null, user_id uuid not null references profiles(id) on delete cascade,
  role text not null, body text not null, time_label text, proposal_refs jsonb,
  seq int not null, payload jsonb not null default '{}',
  primary key (user_id, id)
);
create table integration_tokens (
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('whoop','strava')),
  ciphertext text not null, iv text not null, tag text not null,
  expires_at timestamptz, athlete_ref text, updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source text not null, ok boolean not null, detail text,
  items int not null default 0, ran_at timestamptz not null default now()
);
```

Then for EVERY table above (using `profiles.id` for `profiles`, `user_id` elsewhere):

```sql
alter table <t> enable row level security;
create policy "<t>_own" on <t> for all
  using (auth.uid() = <owner_col>) with check (auth.uid() = <owner_col>);
```

EXCEPTION: `integration_tokens` gets NO select/insert/update policy for authenticated users (service-role only — RLS enabled, zero policies means deny-all to non-service roles). Add a comment in the SQL saying exactly that.

- [ ] **Step 3:** Write `scripts/generate-supabase-seed.ts`: imports the seed object from `src/lib/data/seed.ts`, emits `supabase/seed.sql` (inserts an `auth.users` row + `profiles` row for TEST_USER_ID with email `test@local.dev`, then every domain entity; unknown-to-column fields go in `payload`). Deterministic output (no timestamps). Add script `"db:seed:gen": "tsx scripts/generate-supabase-seed.ts"` (add `tsx` devDep).
- [ ] **Step 4:** Failing test `tests/unit/schema.supabase.test.ts` (uses `@supabase/supabase-js` with local anon key from `supabase status -o json`): (a) anonymous client `select` on each of the 12 tables returns zero rows / permission behavior, never data; (b) service-role client sees the seeded goal named `Honolulu Marathon`; (c) authenticated-as-TEST_USER client (use `supabase.auth.admin.generateLink`/`signInWithPassword` on a seeded password user — simplest: create the test user WITH password `test-password-local` in seed.sql) reads exactly 7 `planned_sessions`. Run: `npm run db:start && npm run db:reset && npm run test:supabase` — verify it fails before the migration exists, passes after.
- [ ] **Step 5:** `npx vitest run` (default suite untouched, still green), `npx tsc --noEmit`, commit `feat: supabase schema, RLS, generated seed, local test stack`.

⚑ **Controller checkpoint after Task 1:** create the cloud Supabase project (user's paid org, region us-east-1), run `supabase link` + `supabase db push`, run seed generator against it, capture URL/keys for env.

---

### Task 2: Auth — email OTP + allowlist + route protection + sign-in screen

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/auth/allowlist.ts`, `src/middleware.ts`, `src/app/sign-in/page.tsx`, `src/components/auth/SignInScreen.tsx`, `src/app/auth/confirm/route.ts` (if needed by @supabase/ssr OTP flow), `tests/unit/auth.test.tsx`, `tests/e2e/auth.spec.ts`
- Modify: `src/app/layout.tsx` (nothing visual — provider only if required), `package.json` (`@supabase/supabase-js`, `@supabase/ssr`)

**Interfaces:**
- Consumes: env `ALLOWED_EMAIL`, `NEXT_PUBLIC_SUPABASE_*`.
- Produces: `getBrowserClient(): SupabaseClient` (singleton); `isAllowedEmail(email: string): boolean` (case-insensitive trim compare vs `ALLOWED_EMAIL`); middleware that redirects unauthenticated requests to `/sign-in` **only when** `NEXT_PUBLIC_REPO_MODE === "supabase"` (local mode keeps Phase-1 behavior so the 42 e2e tests stay green untouched).

- [ ] **Step 1:** Failing unit tests: `isAllowedEmail("  Max.Allaire@GMAIL.com ")` true when `ALLOWED_EMAIL=max.allaire@gmail.com`; false for anything else; `SignInScreen` renders email step → (after submit) 6-digit code step; submitting a code calls `supabase.auth.verifyOtp({ email, token, type: "email" })` (mock the client module); non-allowlisted email shows inline mono error `NOT AUTHORIZED FOR THIS APP` and never calls `signInWithOtp`.
- [ ] **Step 2:** Implement. Sign-in flow: `signInWithOtp({ email, options: { shouldCreateUser: true } })` → `verifyOtp`. Allowlist enforced BOTH client-side (pre-check) and server-side: a Supabase **Auth Hook is not available on all plans — instead** enforce in `src/middleware.ts`: if session user email ≠ allowlist → `supabase.auth.signOut()` + redirect `/sign-in?e=denied`. Screen composition (no mock exists — Instrument idioms only): centered column, Space Grotesk 30px "Marathon", mono 10px label `SIGN IN`, hairline input, lime 50px CTA `SEND CODE` → `VERIFY`, calm inline mono errors.
- [ ] **Step 3:** e2e `tests/e2e/auth.spec.ts`: with `NEXT_PUBLIC_REPO_MODE=local` (CI default) `/sign-in` renders and `/today` is NOT redirected (mode gate works both ways). Playwright e2e for the full OTP loop is NOT automatable (real email) — cover the verify step in unit tests with mocked client; note this in the report.
- [ ] **Step 4:** All suites + tsc + build green. Commit `feat: email OTP auth with allowlist and mode-gated route protection`.

---

### Task 3: supabaseRepo — read paths, row mappers, parity harness

**Files:**
- Create: `src/lib/data/supabase-repo.ts`, `src/lib/data/row-mappers.ts`, `src/lib/data/index.ts`, `tests/parity/repo-parity.ts`, `tests/parity/constants.ts`, `tests/unit/repo-parity-local.test.ts`, `tests/unit/repo-parity-supabase.supabase.test.ts`
- Modify: the 8 screen components' import `{ localRepo }` → `{ repo }` from `@/lib/data` (mechanical, no other change)

**Interfaces:**
- Consumes: Task 1 tables; `Repo` interface in `src/lib/data/repo.ts` (do not change its signatures).
- Produces: `export const repo: Repo` in `src/lib/data/index.ts` — `NEXT_PUBLIC_REPO_MODE === "supabase" ? supabaseRepo : localRepo`; `runRepoParitySuite(makeRepo: () => Promise<Repo>, reset: () => Promise<void>)` in `tests/parity/repo-parity.ts` containing the behavioral tests, exported so both runner files call it.

- [ ] **Step 1:** Write `tests/parity/repo-parity.ts` by PORTING the behavioral assertions that already exist in `tests/unit/repo.test.ts` (proposal accept/modify/dismiss/expiry/provenance, moved-session dual-id, pain logs, session status) into suite functions parameterized over a `Repo`. Wire `repo-parity-local.test.ts` (reset = `localStorage.clear()`) — must pass immediately against `localRepo` (proves the port is faithful) BEFORE any Supabase work.
- [ ] **Step 2:** Failing runner `repo-parity-supabase.supabase.test.ts` (reset = `npm`-invoked `supabase db reset` once per file via `beforeAll`, then per-test cleanup deletes from mutated tables and re-runs seed inserts for them; sign in as the seeded password test user so RLS applies — parity tests must run through RLS, not service-role).
- [ ] **Step 3:** Implement read methods on `supabaseRepo` + `row-mappers.ts` (each mapper: `rowToX(row: unknown): X` = Zod parse of the payload/columns into the domain schema). READS ONLY this task: `getGoal, getBlock, getLatestRecovery, getRecovery7d, getWeekSessions, getSession (incl. dual-id: query by id OR payload->>'movedFromId'), getOpenProposals, getPains, getPredictions (predictions stay seed-derived per spec §8 — return from a `predictions` payload stored on `goals.payload`… NO: keep it simplest, read from the static seed module directly and mark with a code comment "seed-derived until Phase 3"), getStrengthSession, getCoachThread`. Write methods throw `new Error("not implemented until task 4")`.
- [ ] **Step 4:** Read-path parity assertions green in both runners. `npx vitest run` + `npm run test:supabase` + tsc + build + full e2e (local mode, unchanged) green. Commit `feat: supabase repo reads with parity harness and env-selected repo seam`.

---

### Task 4: supabaseRepo — writes + decide_proposal RPC (the spine, server-enforced)

**Files:**
- Create: `supabase/migrations/0002_decide_proposal.sql`, `tests/unit/decide-proposal.supabase.test.ts`
- Modify: `src/lib/data/supabase-repo.ts` (write methods), `tests/parity/repo-parity.ts` (nothing — it already covers writes; just un-skip)

**Interfaces:**
- Consumes: Task 3 harness; Task 1 tables.
- Produces: SQL function `decide_proposal(p_id text, p_decision text, p_modified jsonb)` and Repo writes `decideProposal, startSession, logPain, logRun, appendChat`.

- [ ] **Step 1:** Migration `0002_decide_proposal.sql` — the entire spine in one atomic SECURITY INVOKER function (RLS applies). Contract, verbatim from the spec:

```sql
create or replace function decide_proposal(p_id text, p_decision text, p_modified jsonb default null)
returns void language plpgsql security invoker as $$
declare v_prop proposals%rowtype;
begin
  select * into v_prop from proposals where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'proposal not found'; end if;
  if v_prop.status <> 'proposed' then raise exception 're-decide guard: proposal already %', v_prop.status; end if;
  if p_decision not in ('accepted','modified','dismissed','overridden') then raise exception 'bad decision'; end if;

  update proposals set status = case when p_decision='overridden' then 'dismissed' else p_decision end,
    decided_at = now() where id = p_id and user_id = auth.uid();

  if p_decision in ('accepted','modified') then
    -- apply swap to the target session (payload carries before/after per seed shape)
    update planned_sessions s set
      payload = coalesce(p_modified, v_prop.payload->'after'),
      title = coalesce(p_modified->>'title', v_prop.payload->'after'->>'title', s.title),
      provenance = case when p_decision='accepted' then 'accepted-proposal' else 'modified-proposal' end
      where s.user_id = auth.uid() and s.id = v_prop.session_id;
    -- expire competitors (accept/modify only; dismiss never cascades)
    update proposals set status='expired', decided_at=now()
      where user_id = auth.uid() and session_id = v_prop.session_id
        and id <> p_id and status = 'proposed';
  end if;
end $$;
```

(The implementer MUST reconcile the payload-application details against how `local-repo.ts` `resolveSession`/`decideProposal` actually transform the session — including the moved-session id case writing `movedFromId` — the SQL above is the shape, `local-repo.ts` is the behavioral ground truth, and the parity suite is the judge.)
- [ ] **Step 2:** Failing tests in `decide-proposal.supabase.test.ts` (through RLS as test user): accept → session title/provenance changed + competitor expired; dismiss → nothing mutated, competitor untouched; re-decide → error raised; wrong user → not found. Then un-skip write assertions in the supabase parity runner.
- [ ] **Step 3:** Implement remaining writes in `supabase-repo.ts`: `decideProposal` → `supabase.rpc("decide_proposal", ...)`; `startSession` → update status `in-progress`; `logPain` → insert `pain_logs` + update `pain_areas.severity/trend`; `logRun` → insert `run_logs` + session status `completed` + fold pain (mirror `local-repo.ts logRun` exactly); `appendChat` → insert with next `seq`.
- [ ] **Step 4:** FULL parity suite green against both repos. All other suites + build green. Commit `feat: supabase repo writes with server-enforced proposal spine (decide_proposal RPC)`.

---

### Task 5: Offline cache + mode switch e2e smoke

**Files:**
- Create: `src/lib/data/offline-cache.ts`, `tests/unit/offline-cache.test.ts`, `tests/e2e/supabase-mode.spec.ts`
- Modify: `src/lib/data/index.ts` (wrap supabaseRepo reads in cache), `playwright.config.ts` (second project `supabase-mode` gated on env `SUPABASE_E2E=1` so CI default is unchanged)

**Interfaces:**
- Consumes: Tasks 3-4 repo.
- Produces: `withOfflineCache(repo: Repo): Repo` — every read: try live → on success write-through to `localStorage["marathon.phase2.cache.<method>"]` (Zod-validated on read-back, corrupt → drop); on network failure → return cached value + set a module-level `staleInfo` (consumed by Task 12's markers); no cache → rethrow typed `OfflineError`. Writes: live-only; on failure throw typed `OfflineError` (calm inline handling exists already via each screen's error paths — verify, don't invent).

- [ ] **Step 1:** Failing unit tests: write-through on success; cached value served on failure; corrupt cache dropped; `OfflineError` when cold+offline; writes never cached.
- [ ] **Step 2:** Implement; wire into `index.ts` for supabase mode only.
- [ ] **Step 3:** `supabase-mode.spec.ts` (runs only with `SUPABASE_E2E=1` + local stack): sign in with the seeded password user via `supabase.auth` cookie injection (document the helper), load `/today`, assert the seeded readiness value renders — proving the whole stack: RLS → repo → screen.
- [ ] **Step 4:** All default suites green. Commit `feat: offline read cache and supabase-mode e2e smoke`.

⚑ **Controller checkpoint after Task 5 (Stage 1 ship):** Vercel project env vars, `vercel deploy --prod`, flip `NEXT_PUBLIC_REPO_MODE=supabase` in Vercel only, user signs in on phone + installs PWA. App identical, storage real.

---

### Task 6: Token cipher + shared OAuth plumbing

**Files:**
- Create: `src/lib/crypto/token-cipher.ts`, `src/lib/integrations/oauth.ts`, `src/lib/supabase/admin.ts`, `tests/unit/token-cipher.test.ts`, `tests/unit/oauth.test.ts`

**Interfaces:**
- Produces: `encryptToken(plain: string): {ciphertext, iv, tag}` / `decryptToken({ciphertext, iv, tag}): string` (AES-256-GCM, key = base64 `TOKEN_ENCRYPTION_KEY`, random 12-byte IV per encryption, all fields base64); `saveTokens(provider, tokens: {access, refresh, expiresAt, athleteRef?})` / `loadTokens(provider)` (admin client, `integration_tokens` upsert); `makeState()` / `assertState(cookieVal, param)` (CSRF state: 32-byte random hex in an httpOnly cookie, compared on callback); `getAdminClient()` (service-role, server-only module with `import "server-only"`).

- [ ] **Step 1:** Failing tests: round-trip encrypt/decrypt; unique IV per call (two encryptions of same plaintext differ); tampered tag throws; `assertState` mismatch throws; `token-cipher` importable without Supabase env (pure node:crypto).
- [ ] **Step 2:** Implement with `node:crypto` (`createCipheriv("aes-256-gcm")`). No new deps.
- [ ] **Step 3:** Suites + tsc + build. Commit `feat: aes-256-gcm token cipher and shared oauth state plumbing`.

---

### Task 7: Whoop OAuth connect/disconnect + Settings wiring

**Files:**
- Create: `src/app/api/integrations/whoop/connect/route.ts`, `src/app/api/integrations/whoop/callback/route.ts`, `src/lib/integrations/whoop/client.ts` (token exchange + refresh only this task), `tests/unit/whoop-oauth.test.ts`
- Modify: `src/components/settings/SettingsScreen.tsx` (CONNECT row goes live in supabase mode: shows `CONNECTED`/`NOT CONNECTED` + `CONNECT`→`/api/integrations/whoop/connect` or `DISCONNECT` action; local mode keeps Phase-1 static row so e2e stays green), plus a tiny server action or `/api/integrations/status` returning `{whoop: boolean, strava: boolean}` (token presence only, via admin client — never token contents)

**Interfaces:**
- Consumes: Task 6 cipher/oauth/admin.
- Produces: `exchangeWhoopCode(code): WhoopTokens`, `refreshWhoopTokens(refresh): WhoopTokens` (Zod-parsed wire), connect route (302 to Whoop authorize with `client_id`, `redirect_uri = ${NEXT_PUBLIC_APP_URL}/api/integrations/whoop/callback`, `scope` per Global Constraints, `state`), callback route (assert state → exchange → `saveTokens("whoop", ...)` → 302 `/settings?connected=whoop`); `DELETE` handling for disconnect (delete token row).

- [ ] **Step 1:** Failing tests with mocked `fetch` (vi.stubGlobal): authorize URL contains exact scopes + state cookie set; callback with bad state → 403, never calls token endpoint; happy path persists encrypted tokens (assert via decrypt helper against a stubbed admin client); refresh updates row.
- [ ] **Step 2:** Implement routes + client. Settings wiring per Interfaces (styling: existing Instrument row exactly as Phase 1 built it — only the status text/action changes by mode).
- [ ] **Step 3:** Suites + build + e2e (local mode unchanged). Commit `feat: whoop oauth connect flow with encrypted token storage`.

⚑ **Controller checkpoint before Task 7 runs live:** user creates the Whoop developer app (developer.whoop.com, redirect URL `${prod}/api/integrations/whoop/callback` + `http://localhost:3000/...` for dev); env `WHOOP_CLIENT_ID/SECRET` set locally + Vercel.

---

### Task 8: Whoop sync — recovery, sleep, cycle (day strain), workouts

**Files:**
- Create: `src/lib/integrations/whoop/wire.ts` (Zod wire schemas), `src/lib/integrations/whoop/sync.ts`, `src/lib/sync/staleness.ts`, `tests/unit/whoop-sync.test.ts`
- Modify: `src/lib/integrations/whoop/client.ts` (data fetchers with auto-refresh-on-401-then-retry-once)

**Interfaces:**
- Consumes: Tasks 6-7.
- Produces: `syncWhoop(admin: SupabaseClient, userId: string, {since?: Date}): Promise<SyncResult>` where `SyncResult = {ok: boolean, items: number, detail?: string}`; upserts `recovery_snapshots` keyed `(user_id, day)` mapping: recovery score→`recovery_pct`, hrv (ms)→`hrv_ms`, rhr→`rhr`, cycle strain→`day_strain`, sleep stages/efficiency/score→`sleep` jsonb `{deepSec, remSec, lightSec, efficiencyPct, sleepScorePct, durationSec}` (efficiencyPct and sleepScorePct REMAIN DISTINCT — hard-won Phase-1 invariant); inserts Whoop workouts into `activities` (`whoop_id`, sport, start/end, strain, avg/max HR, `hr_zones` jsonb) — dedupe against Strava happens in Task 11, this task only skips rows whose `whoop_id` already exists (idempotent); writes a `sync_runs` row either way; `STALE_RECOVERY_MS = 3*3600e3`, `STALE_ACTIVITIES_MS = 3600e3`.
- Day attribution: a recovery/cycle belongs to the LOCAL day (home timezone) of its cycle END; use Task 9's timezone helpers — this task defines the helper signatures it needs: `localDayOf(instant: Date, tz: string): string /* YYYY-MM-DD */` (implement here in `src/lib/sync/timezone.ts`, Task 9 reuses).

- [ ] **Step 1:** Failing tests, all fetch-mocked with realistic v2 response fixtures (checked against the Whoop docs at implementation time, committed as `tests/fixtures/whoop/*.json`): happy sync writes snapshot with 88/78 distinct; 401 once → refresh → retry → success; second sync same data → zero duplicate activities, snapshot upserted not duplicated; API error → `{ok:false}` + `sync_runs` row with detail; `localDayOf(new Date("2026-11-02T04:30:00Z"), "America/New_York") === "2026-11-01"` (DST-fall edge) and a spring-forward case.
- [ ] **Step 2:** Implement wire schemas + fetchers + sync + timezone helper (`Intl.DateTimeFormat` with `timeZone`, no dep).
- [ ] **Step 3:** Suites + build. Commit `feat: whoop sync for recovery, sleep, strain and workouts`.

---

### Task 9: Morning cron + on-open refresh (rings go real)

**Files:**
- Create: `src/app/api/cron/morning/route.ts`, `src/lib/sync/run.ts`, `tests/unit/cron-morning.test.ts`
- Modify: `vercel.json` (or `vercel.ts`): `{"crons": [{"path": "/api/cron/morning", "schedule": "0 * * * *"}]}`; `src/lib/data/index.ts` or the screens' shared layout: on-open refresh hook; `src/lib/data/supabase-repo.ts` — `getLatestRecovery`/`getRecovery7d` now read `recovery_snapshots` (fallback to seed values when the table has no rows yet, so the app is never empty pre-first-sync; mark fallback in `staleInfo`)

**Interfaces:**
- Consumes: Task 8 `syncWhoop`, timezone helpers, `sync_runs`.
- Produces: cron route: requires header `authorization: Bearer ${CRON_SECRET}` else 401; loads each profile (there is one), computes local hour via `localHourOf(now, profile.home_timezone)`; **no-op unless local hour == 6** (this is the DST-survival mechanism — hourly cron, tz-checked handler); at 6: `syncWhoop` + (Task 11 will add Strava sweep — leave a `TODO(strava-sweep task 11)` marker comment which Task 11 MUST remove); `refreshIfStale(): Promise<void>` client-callable server action: checks latest `sync_runs` per source vs thresholds, triggers sync if stale — invoked once per app open from the tabs layout (supabase mode only), fire-and-forget, errors swallowed into `staleInfo`.

- [ ] **Step 1:** Failing tests: 401 without secret; no-op at local hour ≠ 6 (freeze time, tz America/New_York); runs sync at 6 exactly once; `refreshIfStale` triggers when last ok sync > 3h, skips when fresh; repo fallback returns seed values with fallback flag when table empty.
- [ ] **Step 2:** Implement. On-open hook: `useEffect` in the `(tabs)` layout client boundary calling the server action once per mount (supabase mode only).
- [ ] **Step 3:** Suites + build + e2e local unchanged. Commit `feat: dst-safe morning cron and on-open staleness refresh`.

⚑ **Controller checkpoint (Stage 2 ship):** deploy; verify next morning's ring is real; run `scripts/smoke-whoop.ts` (Task 14 provides it — at this checkpoint run a manual curl sequence documented in the task report instead).

---

### Task 10: Strava OAuth + client

**Files:**
- Create: `src/app/api/integrations/strava/connect/route.ts`, `.../callback/route.ts`, `src/lib/integrations/strava/client.ts`, `src/lib/integrations/strava/wire.ts`, `tests/unit/strava-oauth.test.ts`
- Modify: `src/components/settings/SettingsScreen.tsx` (Strava row live, same pattern as Task 7)

**Interfaces:** mirrors Task 7 exactly with Strava endpoints/scope (`activity:read_all`), `athleteRef` = athlete id from token response; data fetchers `getActivity(id)`, `listActivities({after: Date})` Zod-parsed, auto-refresh-on-401-retry-once.

- [ ] Steps mirror Task 7 (failing oauth tests → implement → suites → commit `feat: strava oauth connect flow`). The reviewer should reject copy-paste divergence: shared logic must live in `src/lib/integrations/oauth.ts`, not be duplicated.

⚑ **Controller checkpoint:** user creates Strava API app (strava.com/settings/api, callback domain = prod host); env set.

---

### Task 11: Strava webhook + import + session matching + Whoop dedupe + catch-up sweep

**Files:**
- Create: `src/app/api/webhooks/strava/route.ts`, `src/lib/integrations/strava/sync.ts`, `src/lib/activities/matching.ts`, `src/lib/activities/dedupe.ts`, `scripts/register-strava-webhook.ts`, `tests/unit/strava-webhook.test.ts`, `tests/unit/matching.test.ts`, `tests/unit/dedupe.test.ts`
- Modify: `src/app/api/cron/morning/route.ts` (add sweep, REMOVE the Task-9 marker comment), `src/lib/data/supabase-repo.ts` (Log screen's imported-run read + Progress mileage/streak/ticks now computed from `activities`/`planned_sessions` with seed fallback pre-first-import)

**Interfaces:**
- Produces:
  - Webhook route: GET echoes `{ "hub.challenge": <param> }` when `hub.verify_token === STRAVA_WEBHOOK_VERIFY_TOKEN` else 403; POST validates `subscription_id` matches stored value (env or `sync_runs` detail — use env `STRAVA_SUBSCRIPTION_ID` set at registration), ACKs 200 immediately, then processes: only `object_type === "activity"` + `aspect_type in ("create","update")`; fetch full activity → import.
  - `importStravaActivity(admin, userId, wireActivity): Promise<{activityId, matchedSessionId?}>` — idempotent on `strava_id` (upsert).
  - `matchSession(activity, sessions): PlannedSession | null` — rules verbatim from spec §6: same local day (home tz) AND session type is a run type (`easy|tempo|speed|long|intervals` — read the actual union from `schemas.ts`) AND status ≠ completed; choose min `|planned_distance - activity_distance|`; tie → priority order `[speed, tempo, long, easy]`. Match ⇒ session status `completed`, `activities.matched_session_id` set.
  - `overlapRatio(aStart,aEnd,bStart,bEnd): number` and `dedupeWhoop(admin, userId, imported): Promise<void>` — a Whoop activity and Strava activity are the same physical run when sport is run-equivalent AND overlap ≥ 0.5 of the SHORTER window; merge = one row keeping `strava_id` fields for distance/pace + `whoop_id` fields for strain/HR (Strava is source of truth for distance/pace per spec), delete the redundant row.
  - Sweep in cron: `listActivities({after: lastOkStravaSync})` → import each (idempotent).

- [ ] **Step 1:** Failing tests: GET challenge echo + bad verify token 403; POST wrong subscription id → 200-ack but no fetch (log to sync_runs); create event → activity row + matched session completed; duplicate delivery → single row; `matchSession` cases: exact-distance match, closest-of-two, tie→priority, wrong-day no-match, completed-session no-match; `overlapRatio` boundary 0.49 no-merge / 0.5 merge; merged row has Strava distance + Whoop strain.
- [ ] **Step 2:** Implement all; `scripts/register-strava-webhook.ts` posts to `push_subscriptions` with callback `${NEXT_PUBLIC_APP_URL}/api/webhooks/strava` and prints the subscription id for env.
- [ ] **Step 3:** Suites + build + e2e local unchanged. Commit `feat: strava webhook import with session matching and whoop dedupe`.

⚑ **Controller checkpoint (Stage 3 ship):** deploy, register webhook, user runs; verify auto-import + Log flow on a real run.

---

### Task 12: Stale markers + reconnect prompts + typed error surfacing

**Files:**
- Create: `src/components/sync/StaleMarker.tsx`, `tests/unit/stale-marker.test.tsx`
- Modify: `src/components/body/BodyScreen.tsx`, `src/components/today/ReadinessHero.tsx` region, `src/components/log/ImportedRunSection.tsx` (each: render `<StaleMarker sourceKey>` under the section header when `staleInfo` reports stale), `src/components/settings/SettingsScreen.tsx` (RECONNECT state on rows whose last sync errored with auth failure), `tests/e2e/` extend body/today specs for marker absence in local mode

**Interfaces:**
- Consumes: Task 5 `staleInfo`, `sync_runs` via a `getSyncStatus(): Promise<Record<"whoop"|"strava", {lastOkAt: Date|null, authBroken: boolean}>>` added to the repo-adjacent module `src/lib/sync/staleness.ts` (NOT on the `Repo` interface — screens import it directly; local mode returns all-fresh so Phase-1 e2e is untouched).
- Produces: `StaleMarker` — one line, existing idiom exactly: mono 10px `.18em` `#5c6168` text `STALE — LAST SYNCED {n}H AGO` (hours rounded down, `<1h` never renders by definition of thresholds). No icons, no color, no new pattern.

- [ ] Steps: failing unit tests (renders only when stale; text format exact; hidden in local mode) → implement → screen wiring → all suites incl. full e2e → commit `feat: stale data markers and reconnect prompts`.

---

### Task 13: Plan re-anchoring

**Files:**
- Create: `scripts/reanchor-plan.ts`, `tests/unit/reanchor.test.ts`

**Interfaces:**
- Produces: `reanchorPlan(seed: Seed, today: Date, tz: string): Seed` (pure function, script wraps it): shifts all `planned_sessions` dates and `blocks.week` so that the CURRENT real week (today, home tz) maps onto the seed's canonical week (Block 2 · week 7 shape preserved relative to race day 2026-12-13 — weeks count BACK from race day: race week = week 16 of Block 2; compute `week = 16 - floor((raceDay - startOfWeek(today))/7d)` clamped 1..16, sessions keep weekday alignment: seed's MON session lands on this week's MON, etc.); proposals retarget the same relative session ids; the script emits UPDATE SQL for the cloud DB and also regenerates `supabase/seed.sql` via Task 1's generator.
- Deterministic: takes `today` as input, never `Date.now()` inside the pure function.

- [ ] Steps: failing tests (2026-07-09 → Block 2 week math is asserted with hand-computed values: race 2026-12-13 is a Sunday; week containing 2026-07-09 ⇒ 22 full weeks before race week ⇒ seed 24-week arc maps to Block 1 week 3 — the implementer MUST hand-verify this arithmetic against the seed's block structure and encode the verified expectation, not this prose) → implement → suites → commit `feat: plan re-anchoring to real calendar dates`.

---

### Task 14: Live smoke scripts, contractor-review flag doc, final sweep

**Files:**
- Create: `scripts/smoke-whoop.ts`, `scripts/smoke-strava.ts`, `docs/security-review-priorities.md`
- Modify: `README.md` (Phase 2 dev section: local stack, env, modes, cron/webhook registration)

**Interfaces:**
- Produces: `npx tsx scripts/smoke-whoop.ts` — loads real tokens via admin client, calls each Whoop fetcher once, prints counts, exits nonzero on failure (NO writes to prod tables — read-only smoke); same for Strava. `docs/security-review-priorities.md` lists exactly: `src/lib/crypto/token-cipher.ts`, `src/lib/integrations/oauth.ts`, both callback routes, webhook route, `supabase/migrations/0001_schema.sql` RLS + `0002_decide_proposal.sql`, middleware allowlist — with one line each on what a reviewer must check.

- [ ] Steps: write scripts + doc + README → run ALL suites (`npx vitest run`, `npm run test:supabase` with stack, `npx tsc --noEmit`, `npm run build`, `PLAYWRIGHT_TEST=1 npx playwright test`, and `SUPABASE_E2E=1` smoke spec) → commit `feat: live smoke scripts and security review priorities`.

---

## Self-review (done at write time)

- **Spec coverage:** §2 hybrid sync → Tasks 8/9/11; §3 tables → Task 1; §4 repo/offline/spine/re-decide → Tasks 3-5; §5 Whoop incl. workouts/strain → Task 8; §6 Strava/matching/dedupe → Tasks 10-11; §7 auth/OTP/allowlist/crypto/flag → Tasks 2/6/14; §8 screens real → Tasks 9/11/12; §9 errors/stale → Tasks 5/12; §10 testing → Tasks 1/3/4/5 parity + mocks + smoke (Task 14); §11 rollout → stage checkpoints; §12 accounts → ⚑ checkpoints; §13 criteria → covered by stage ships + Task 12/13.
- **Placeholders:** the single `TODO(strava-sweep task 11)` is an intentional cross-task contract with explicit removal owner; no other TBDs.
- **Type consistency:** `SyncResult`, `Repo` unchanged, `localDayOf/localHourOf` defined Task 8, consumed Task 9; `staleInfo` defined Task 5, consumed Task 12; TEST_USER_ID defined Task 1, consumed Tasks 3-5.
- **Known judgment points for implementers (flag in reports, don't guess silently):** Whoop v2 exact wire shapes; `decide_proposal` payload transform vs `local-repo.ts` ground truth; Task 13 week arithmetic hand-verification.
