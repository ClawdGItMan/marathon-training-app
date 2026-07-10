-- Task 3 plan amendment (approved by controller).
--
-- Task 1's DDL left three tables without a payload jsonb column, orphaning
-- these Phase-1 seed fields with nowhere to round-trip through Postgres:
--   goals:               predictedSec, daysOut, streak
--   blocks:               number, weekMilesDone, weekMilesTarget
--   recovery_snapshots:  recoveryDelta, hrvDeltaPct, rhrDelta, loadLabel
-- (respRate has no dedicated column either, but is folded into the existing
-- `sleep` jsonb blob per Task 1's seed-generator notes — no schema change
-- needed for it.)
--
-- This is migration 0002 in the Task-3 plan amendment. It renumbers the
-- plan's decide_proposal RPC migration to 0003 — that is Task 4's concern,
-- not addressed here.
--
-- No grant changes: this only adds columns to tables that already have
-- explicit authenticated/service_role grants from 0001_schema.sql. Table
-- grants are on the whole table, not per-column, so existing grants already
-- cover the new column; RLS policies are row-level and unaffected by adding
-- a column.

alter table goals add column payload jsonb not null default '{}';
alter table blocks add column payload jsonb not null default '{}';
alter table recovery_snapshots add column payload jsonb not null default '{}';
