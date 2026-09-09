-- Transportation: saved places, return trips, and approvals that survive a
-- manager's leave.
--
-- 1) Saved places: the tenant names its usual pickup and drop-off points
--    once ("Base main gate", "Douala airport"); forms offer them and requests
--    are canonicalised to the saved spelling, so reports and the planner
--    group the same place under one name.
-- 2) Return trips: a request may carry its return leg as a second request
--    that points back at the outbound one; approving one approves both.
-- 3) Delegated approvals: a line manager who has delegated their access
--    (Account › Delegate my access) lets the delegate see and decide their
--    reports' ride requests for the delegation window. The policies consult
--    public.delegators_for(auth.uid()), the same source the module
--    permissions use.

create table if not exists public.transport_places (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.transport_places enable row level security;

drop policy if exists transport_places_select on public.transport_places;
create policy transport_places_select on public.transport_places for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_super_admin()));
drop policy if exists transport_places_admin on public.transport_places;
create policy transport_places_admin on public.transport_places for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));

-- One spelling per place, whatever the case it was typed in.
create unique index if not exists transport_places_tenant_name
  on public.transport_places (tenant_id, lower(name));

-- Return trips: the return leg points at the outbound request.
alter table public.transport_requests
  add column if not exists return_of uuid references public.transport_requests(id) on delete set null;
create index if not exists idx_transport_requests_return_of on public.transport_requests (return_of);

-- Manager policies, now delegation-aware.
drop policy if exists transport_requests_select_manager on public.transport_requests;
create policy transport_requests_select_manager on public.transport_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = transport_requests.requester_id
         and (
           p.manager_id = (select auth.uid())
           or p.manager_id in (select public.delegators_for((select auth.uid())))
         )
    )
  );

drop policy if exists transport_requests_update_manager on public.transport_requests;
create policy transport_requests_update_manager on public.transport_requests
  for update to authenticated
  using (
    status = 'awaiting_approval'
    and exists (
      select 1 from public.profiles p
       where p.id = transport_requests.requester_id
         and (
           p.manager_id = (select auth.uid())
           or p.manager_id in (select public.delegators_for((select auth.uid())))
         )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = transport_requests.requester_id
         and (
           p.manager_id = (select auth.uid())
           or p.manager_id in (select public.delegators_for((select auth.uid())))
         )
    )
  );

-- A note the system writes (an escalation) has no author.
alter table public.transport_task_updates alter column author_id drop not null;
