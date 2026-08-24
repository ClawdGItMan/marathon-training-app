-- Task 4: decide_proposal RPC — the proposal spine, server-enforced.
--
-- Filename note: the task-4 brief names this migration 0002_decide_proposal.sql,
-- but 0002 was already taken by the Task-3 payload-columns amendment
-- (0002_payload_columns.sql) — this is migration 0003 per that amendment's
-- own note ("renumbers the plan's decide_proposal RPC migration to 0003").
--
-- SECURITY INVOKER (not DEFINER): this function runs with the *caller's*
-- privileges, so every read/update inside it is still subject to RLS via
-- auth.uid() exactly as if the caller ran the statements directly — a
-- proposal or session belonging to another user is invisible to this
-- function in exactly the same way it is invisible to a direct query. It is
-- callable by `authenticated` only because of 0001_schema.sql's
-- `alter default privileges ... grant all on routines to authenticated`
-- (EXECUTE on this new routine), not because of any special grant added
-- here — do not switch this to SECURITY DEFINER or add bypass grants
-- without a fresh security review (see Task 1's security review note).
--
-- Contract shape is from .superpowers/sdd/task-4-brief.md Step 1; the
-- BEHAVIORAL ground truth is src/lib/data/local-repo.ts
-- (decideProposal/resolveSession). Two places this function's SQL differs
-- from the brief's sketch, reconciled against that ground truth (see
-- task-4-report.md for the full write-up):
--
--   1. planned_sessions.payload is NOT the full session object — per
--      scripts/generate-supabase-seed.ts / src/lib/data/row-mappers.ts it is
--      only `{distanceMi, paceTarget, zone, movedFromId?}`. This function
--      rebuilds that shape from the target session's fields rather than
--      assigning the proposal's `after`/`p_modified` payload verbatim (the
--      brief's `payload = coalesce(p_modified, v_prop.payload->'after')`
--      would have overwritten the column with the wrong shape entirely).
--
--   2. accept/modify can change the session's `id` (moved-session case,
--      proposal-2: sun-long -> sat-long-moved, per local-repo.ts's
--      resolveSession/findSeedIdForResultingId). When the target's `id`
--      differs from the proposal's original `session_id`, this function
--      renames the planned_sessions row itself (its primary key is
--      (user_id, id), and no other table has an FK constraint on
--      planned_sessions.id, so this is safe) and stamps
--      payload.movedFromId = <old id>, which is exactly what
--      supabaseRepo.getSession's existing `payload->>movedFromId` fallback
--      (written in Task 3) expects to resolve both ids against.
create or replace function decide_proposal(p_id text, p_decision text, p_modified jsonb default null)
returns void
language plpgsql
security invoker
as $$
declare
  v_prop proposals%rowtype;
  v_target jsonb;
  v_old_id text;
  v_new_id text;
begin
  select * into v_prop from proposals where id = p_id and user_id = auth.uid() for update;
  if not found then
    -- Covers both "no such proposal" and "exists, but owned by another
    -- user" identically — RLS already hides the other user's row from the
    -- SELECT above, so both causes land here with the same message and no
    -- information leak about which case it was.
    raise exception 'proposal not found';
  end if;

  if v_prop.status <> 'proposed' then
    raise exception 're-decide guard: proposal already %', v_prop.status;
  end if;

  if p_decision not in ('accepted', 'modified', 'dismissed', 'overridden') then
    raise exception 'bad decision: %', p_decision;
  end if;

  update proposals
    set status = case when p_decision = 'overridden' then 'dismissed' else p_decision end,
        decided_at = now()
    where id = p_id and user_id = auth.uid();

  if p_decision in ('accepted', 'modified') then
    v_target := coalesce(p_modified, v_prop.payload -> 'after');
    v_old_id := v_prop.session_id;
    v_new_id := v_target ->> 'id';

    -- Apply the swap to the target session, replacing its content wholesale
    -- from the target (after/edited) session object — mirrors
    -- local-repo.ts's `resolved = {...proposal.after, provenance: "..."}` /
    -- `{...decision.editedSession, provenance: "..."}`, which replace the
    -- whole session rather than merging fields.
    update planned_sessions s set
      id = v_new_id,
      date = (v_target ->> 'date')::date,
      title = v_target ->> 'title',
      type = v_target ->> 'type',
      detail = v_target ->> 'detail',
      structure = coalesce(v_target -> 'structure', '[]'::jsonb),
      status = coalesce(v_target ->> 'status', s.status),
      provenance = case when p_decision = 'accepted' then 'accepted-proposal' else 'modified-proposal' end,
      payload = jsonb_strip_nulls(jsonb_build_object(
        'distanceMi', v_target -> 'distanceMi',
        'paceTarget', v_target -> 'paceTarget',
        'zone', v_target -> 'zone',
        'movedFromId', case when v_new_id <> v_old_id then to_jsonb(v_old_id) else null::jsonb end
      ))
      where s.user_id = auth.uid() and s.id = v_old_id;

    if not found then
      raise exception 'target session not found: %', v_old_id;
    end if;

    -- Expire competitors (accept/modify only; dismiss never cascades — see
    -- the guard above, which only enters this branch for accepted/modified).
    -- Matched against the proposal's ORIGINAL session_id column, which never
    -- changes even when the underlying planned_sessions row's own id does.
    update proposals set status = 'expired', decided_at = now()
      where user_id = auth.uid() and session_id = v_prop.session_id
        and id <> p_id and status = 'proposed';
  end if;
end;
$$;
