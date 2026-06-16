-- =============================================================================
-- Offshore trips for ad-hoc named persons.
--
-- Until now every trip required an employee profile. Hosts often need to add
-- people who aren't in the directory (visitors, contractors, new hires), so a
-- trip may now identify its traveller by EITHER a profile_id (existing
-- employee) OR a free-text person_name. requester_id records who raised the
-- trip so they can track and manage named guests they don't "own".
-- =============================================================================

alter table public.offshore_trips alter column profile_id drop not null;
alter table public.offshore_trips add column if not exists person_name text;
alter table public.offshore_trips add column if not exists requester_id uuid
  references public.profiles(id) on delete set null;

-- Every trip must identify a person one way or the other.
alter table public.offshore_trips drop constraint if exists offshore_trips_person_present;
alter table public.offshore_trips add constraint offshore_trips_person_present
  check (profile_id is not null or person_name is not null);

create index if not exists idx_offshore_trips_requester
  on public.offshore_trips(requester_id);

-- Requester can see and (while still 'requested') manage the trips they raised,
-- including those for named guests with no profile of their own.
drop policy if exists "offshore_trips_select_own" on public.offshore_trips;
create policy "offshore_trips_select_own" on public.offshore_trips for select to authenticated
  using (profile_id = auth.uid() or requester_id = auth.uid());
drop policy if exists "offshore_trips_insert" on public.offshore_trips;
create policy "offshore_trips_insert" on public.offshore_trips for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or requester_id = auth.uid())
  );
drop policy if exists "offshore_trips_update_own" on public.offshore_trips;
create policy "offshore_trips_update_own" on public.offshore_trips for update to authenticated
  using ((profile_id = auth.uid() or requester_id = auth.uid()) and status = 'requested')
  with check (profile_id = auth.uid() or requester_id = auth.uid());
