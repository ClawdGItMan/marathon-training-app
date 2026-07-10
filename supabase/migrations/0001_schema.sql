-- Phase 2 foundation schema. Transcribed verbatim from
-- .superpowers/sdd/task-1-brief.md (Task 1, Step 2) — the DDL there is the
-- contract; do not redesign columns here.

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

-- Row Level Security: every table below is keyed to auth.uid() via the same
-- "for all using/with check" pattern. `profiles` uses its own `id` as the
-- owner column; every other table uses `user_id`.

alter table profiles enable row level security;
create policy "profiles_own" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

alter table goals enable row level security;
create policy "goals_own" on goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table blocks enable row level security;
create policy "blocks_own" on blocks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table planned_sessions enable row level security;
create policy "planned_sessions_own" on planned_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table proposals enable row level security;
create policy "proposals_own" on proposals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table pain_areas enable row level security;
create policy "pain_areas_own" on pain_areas for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table pain_logs enable row level security;
create policy "pain_logs_own" on pain_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table recovery_snapshots enable row level security;
create policy "recovery_snapshots_own" on recovery_snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table activities enable row level security;
create policy "activities_own" on activities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table run_logs enable row level security;
create policy "run_logs_own" on run_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table chat_messages enable row level security;
create policy "chat_messages_own" on chat_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table sync_runs enable row level security;
create policy "sync_runs_own" on sync_runs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- integration_tokens: RLS enabled with ZERO policies for the authenticated/
-- anon roles on purpose. This is a deny-all exception to the "<t>_own"
-- pattern above: encrypted OAuth tokens are only ever read/written by the
-- service-role client from cron/webhook route handlers (see Global
-- Constraints), never by a user-scoped browser client. Row Level Security
-- with no policy means every non-service-role request is denied, for both
-- reads and writes.
alter table integration_tokens enable row level security;

-- Table-level API grants. Newer Supabase CLI/Postgres defaults do NOT
-- auto-expose new public-schema tables to the Data API roles (see this
-- project's supabase/config.toml, [api] `auto_expose_new_tables` comment) —
-- without these grants every request gets a 42501 "permission denied"
-- before RLS is even evaluated.
--
-- Defense-in-depth least-privilege grants:
-- - anon: NO table grants (no pre-login access). usage on schema for stack compatibility.
-- - authenticated: select, insert, update, delete ONLY (no truncate/references/trigger).
-- - service_role: full access (bypasses RLS by Supabase convention).
-- - integration_tokens: NO grants to authenticated (service-role only, RLS also denies).
--
-- RLS policies above still govern per-row access for anon/authenticated.

-- Test: anon does NOT need schema usage (no pre-login table access)
grant usage on schema public to authenticated, service_role;

-- Authenticated: limited DML grants on all tables EXCEPT integration_tokens
grant select, insert, update, delete on profiles to authenticated;
grant select, insert, update, delete on goals to authenticated;
grant select, insert, update, delete on blocks to authenticated;
grant select, insert, update, delete on planned_sessions to authenticated;
grant select, insert, update, delete on proposals to authenticated;
grant select, insert, update, delete on pain_areas to authenticated;
grant select, insert, update, delete on pain_logs to authenticated;
grant select, insert, update, delete on recovery_snapshots to authenticated;
grant select, insert, update, delete on activities to authenticated;
grant select, insert, update, delete on run_logs to authenticated;
grant select, insert, update, delete on chat_messages to authenticated;
grant select, insert, update, delete on sync_runs to authenticated;

-- Service-role: full access (bypasses RLS)
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

-- Sequences: grant to authenticated and service_role
grant usage, select on all sequences in schema public to authenticated;
grant all on all routines in schema public to authenticated;

-- Routines: already granted above for authenticated; service_role has all

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant all on routines to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;
