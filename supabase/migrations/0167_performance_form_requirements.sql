-- =============================================================================
-- Performance module: the standard evaluation form's supporting requirements.
--
-- 1. The number of goals defaults to 3 (was 1 minimum / 8 maximum). Still
--    configurable per tenant and per cycle — only the default moves.
-- 2. Administrator proxy: an action taken on somebody's behalf records BOTH
--    parties, so the timeline can never be mistaken for the person's own work.
-- =============================================================================

-- --- 1. Goals default to 3 ---------------------------------------------------

alter table public.performance_config
  alter column min_goals set default 3,
  alter column max_goals set default 3;

-- Move tenants still sitting on the old default. A tenant that deliberately
-- chose its own range is left alone: only an exact 1/8 pair — which is what the
-- old default wrote — is treated as "never configured".
update public.performance_config
   set min_goals = 3, max_goals = 3, updated_at = now()
 where min_goals = 1 and max_goals = 8;

-- --- 2. Proxy attribution ----------------------------------------------------

-- actor_id has always held whoever actually pressed the button. This records
-- who they were acting FOR, which is the half that was missing: without it an
-- HR admin completing a manager's review is indistinguishable from the manager
-- doing it themselves.
alter table public.appraisal_events
  add column if not exists on_behalf_of uuid references public.profiles (id) on delete set null;

comment on column public.appraisal_events.on_behalf_of is
  'Set when an administrator acted as a proxy: actor_id is who pressed the button, on_behalf_of is the person whose step it was.';

-- The proxy audit is read by person, so index the lookup.
create index if not exists appraisal_events_on_behalf_of_idx
  on public.appraisal_events (on_behalf_of)
  where on_behalf_of is not null;
