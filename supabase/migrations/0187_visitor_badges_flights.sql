-- Visitors: a badge pool, and the flights a visitor arrives or leaves on.
--
-- 1) visitor_badges: the physical badges reception hands out. Check-in
--    offers a free one; check-out records whether it came back; the board
--    shows badges out and not returned.
-- 2) A visitor's flights: the arrival and departure flight numbers, and the
--    transport requests raised for the airport pickup and drop-off, so the
--    dispatch desk sees the run without anyone retyping it.

create table if not exists public.visitor_badges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists visitor_badges_tenant_number on public.visitor_badges (tenant_id, lower(number));

alter table public.visitor_badges enable row level security;

drop policy if exists visitor_badges_select on public.visitor_badges;
create policy visitor_badges_select on public.visitor_badges for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_super_admin()));
drop policy if exists visitor_badges_write on public.visitor_badges;
create policy visitor_badges_write on public.visitor_badges for all to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and ((select public.is_tenant_admin()) or public.has_module_permission('visitors', 'operate')))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and ((select public.is_tenant_admin()) or public.has_module_permission('visitors', 'operate')))
  );

alter table public.visitors
  add column if not exists badge_returned boolean,
  add column if not exists badge_returned_at timestamptz,
  add column if not exists flight_arrival text,
  add column if not exists flight_departure text,
  add column if not exists pickup_request_id uuid references public.transport_requests(id) on delete set null,
  add column if not exists dropoff_request_id uuid references public.transport_requests(id) on delete set null;
create index if not exists idx_visitors_pickup_request on public.visitors (pickup_request_id) where pickup_request_id is not null;
create index if not exists idx_visitors_dropoff_request on public.visitors (dropoff_request_id) where dropoff_request_id is not null;

-- Reception follows the airport runs it raised: whoever registers or
-- receives visitors may read the airport pickup / drop-off tasks.
drop policy if exists transport_requests_select_visitor_desk on public.transport_requests;
create policy transport_requests_select_visitor_desk on public.transport_requests
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and task_type in ('airport_pickup', 'airport_dropoff')
    and (public.has_module_permission('visitors', 'operate') or public.has_module_permission('visitors', 'create'))
  );
