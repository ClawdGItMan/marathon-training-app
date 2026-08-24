-- 0004: profiles INSERT lockdown (final-review fix I1).
--
-- Why: the email allowlist (ALLOWED_EMAIL, src/middleware.ts) gates only the
-- app's own routes — it can never cover direct calls to the Supabase Auth
-- API. With `shouldCreateUser: true` on the sign-in screen (kept: a first
-- OTP sign-in must be able to create the owner's auth.users row), any
-- stranger can OTP-register an auth.users row and hold an authenticated
-- session. Under 0001's `profiles_own` FOR ALL policy + table INSERT grant,
-- that session could then self-insert a `profiles` row — squatting a
-- profile, becoming visible to the morning cron (which iterates ALL
-- profiles), and gaining a target row for every user_id-scoped table.
--
-- Fix: profile provisioning is service-role-only. The FOR ALL policy is
-- replaced with separate select/update/delete policies (same
-- `auth.uid() = id` predicates) and deliberately NO insert policy for
-- `authenticated`; the table-level INSERT grant is revoked as
-- defense-in-depth (deny at the grant layer even before RLS is evaluated).
-- The C1 cloud bootstrap (README "Cloud bootstrap": seed generator run with
-- SEED_USER_ID against the cloud DB, applied via psql/SQL editor as the
-- service role) is exactly that provisioning path.
--
-- Result: a stranger who OTP-registers holds an empty session with zero
-- rows — every `<t>_own` policy scopes to auth.uid(), they have no profiles
-- row to key anything to, they cannot create one, and the cron never sees
-- them.

drop policy "profiles_own" on profiles;

create policy "profiles_select_own" on profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles_delete_own" on profiles for delete
  using (auth.uid() = id);

revoke insert on profiles from authenticated;
