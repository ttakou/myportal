-- Transportation: approval before dispatch, recurring shuttles, and the
-- columns the day planner and notifications lean on.
--
-- 1) A request may wait on the requester's line manager before the dispatch
--    desk sees it (tenant setting `require_approval`). New status, who
--    approved and when, and RLS so a manager can see and decide their own
--    reports' requests.
-- 2) A shuttle is a run that repeats — base to airport at 06:30 on weekdays —
--    and the nightly job creates the day's task from it. One task per shuttle
--    per day, enforced.

-- Applied separately first (a new enum value cannot be used in the same
-- transaction that adds it):
--   alter type public.transport_request_status add value if not exists 'awaiting_approval';

alter table public.transport_requests
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists shuttle_id uuid,
  add column if not exists shuttle_date date;

-- A line manager sees their direct reports' requests, and may decide the
-- ones waiting on them.
drop policy if exists transport_requests_select_manager on public.transport_requests;
create policy transport_requests_select_manager on public.transport_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = transport_requests.requester_id
         and p.manager_id = (select auth.uid())
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
         and p.manager_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = transport_requests.requester_id
         and p.manager_id = (select auth.uid())
    )
  );

-- Recurring shuttles.
create table if not exists public.transport_shuttles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  pickup text not null,
  dropoff text not null,
  -- Local departure time (the tenant's clock).
  depart_time time not null,
  -- 0 = Sunday … 6 = Saturday.
  days_of_week int[] not null default '{1,2,3,4,5}',
  passengers int not null default 1,
  task_type public.transport_task_type not null default 'passenger',
  driver_id uuid references public.transport_drivers(id) on delete set null,
  vehicle_id uuid references public.transport_vehicles(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_transport_shuttles_updated_at on public.transport_shuttles;
create trigger trg_transport_shuttles_updated_at before update on public.transport_shuttles
  for each row execute function public.set_updated_at();

alter table public.transport_shuttles enable row level security;

drop policy if exists transport_shuttles_select on public.transport_shuttles;
create policy transport_shuttles_select on public.transport_shuttles for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_super_admin()));
drop policy if exists transport_shuttles_admin on public.transport_shuttles;
create policy transport_shuttles_admin on public.transport_shuttles for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));

create index if not exists idx_transport_shuttles_tenant on public.transport_shuttles (tenant_id);

alter table public.transport_requests
  drop constraint if exists transport_requests_shuttle_id_fkey,
  add constraint transport_requests_shuttle_id_fkey
    foreign key (shuttle_id) references public.transport_shuttles(id) on delete set null;

-- One task per shuttle per day: a re-run of the job cannot double a run.
create unique index if not exists transport_requests_shuttle_day
  on public.transport_requests (shuttle_id, shuttle_date) where shuttle_id is not null;

create index if not exists idx_transport_requests_approved_by on public.transport_requests (approved_by);
