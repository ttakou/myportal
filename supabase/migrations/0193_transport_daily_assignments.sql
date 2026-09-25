-- The desk's daily assignments tally: how many assignments each driver ran
-- on each day, the portal version of the "Daily Assignments Monitoring"
-- workbook. A day with rows here is a recorded day and the report shows
-- these counts; a day without falls back to the driver tasks dispatched
-- through the portal. The 2026 workbook is loaded as source 'import'; the
-- desk's own entries are 'tally'.
create table if not exists public.transport_daily_assignments (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day date not null,
  driver_id uuid not null references public.transport_drivers(id) on delete cascade,
  assignments integer not null default 0 check (assignments between 0 and 99),
  source text not null default 'tally' check (source in ('import', 'tally')),
  recorded_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, day, driver_id)
);

create index if not exists idx_transport_daily_assignments_driver on public.transport_daily_assignments (driver_id);

alter table public.transport_daily_assignments enable row level security;

-- Read: the desk (tenant admins) and finance, who read the transport reports.
drop policy if exists transport_daily_assignments_select on public.transport_daily_assignments;
create policy transport_daily_assignments_select on public.transport_daily_assignments for select to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id()) and (select public.is_finance())));

-- Write: the desk.
drop policy if exists transport_daily_assignments_admin on public.transport_daily_assignments;
create policy transport_daily_assignments_admin on public.transport_daily_assignments for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));

-- The column order the desk is used to on the monitoring sheet.
alter table public.transport_drivers add column if not exists sort_order integer;
