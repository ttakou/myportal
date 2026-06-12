-- =============================================================================
-- Offshore Phase 2: Visitor offshore requests + accommodation allocation
--
-- Visitors (non-rotation travellers) raise a request, get approved, are
-- allocated an available bed for a date range, board (POB up) and return
-- (POB down, bed released). Bed availability is checked across the full stay,
-- protecting fixed staff rooms and rooms under maintenance.
-- =============================================================================

create table if not exists public.offshore_visit_requests (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  requester_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  visitor_name          text not null,
  visitor_company       text,
  visitor_type          text not null default 'employee'
                        check (visitor_type in ('employee','contractor','vendor','auditor','regulator','client','management')),
  gender                text not null default 'any' check (gender in ('any','male','female')),
  host_department       text,
  host_name             text,
  purpose               text,
  installation_id       uuid references public.offshore_installations(id) on delete set null,
  depart_date           date not null,
  return_date           date,
  overnight             boolean not null default true,
  accommodation_required boolean not null default true,
  emergency_contact     text,
  status                text not null default 'requested'
                        check (status in ('requested','approved','rejected','onboard','returned','cancelled')),
  approved_by           uuid references public.profiles(id) on delete set null,
  approved_at           timestamptz,
  reject_reason         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_offshore_visits_tenant on public.offshore_visit_requests(tenant_id, status);

drop trigger if exists trg_offshore_visits_updated_at on public.offshore_visit_requests;
create trigger trg_offshore_visits_updated_at before update on public.offshore_visit_requests
  for each row execute function public.set_updated_at();

-- Bed allocations drive date-range availability. Visitor allocations link the
-- request; the occupant_name is denormalised for display.
create table if not exists public.offshore_bed_allocations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  room_id          uuid not null references public.offshore_rooms(id) on delete cascade,
  visit_request_id uuid references public.offshore_visit_requests(id) on delete cascade,
  occupant_name    text not null,
  from_date        date not null,
  to_date          date not null,
  status           text not null default 'reserved'
                   check (status in ('reserved','checked_in','checked_out')),
  created_at       timestamptz not null default now()
);
create index if not exists idx_offshore_alloc_room on public.offshore_bed_allocations(room_id, from_date, to_date);
create index if not exists idx_offshore_alloc_tenant on public.offshore_bed_allocations(tenant_id, status);

alter table public.offshore_visit_requests enable row level security;
alter table public.offshore_bed_allocations enable row level security;

-- Visit requests: the raiser reads/creates their own; tenant/safety admins manage all.
drop policy if exists "offshore_visits_select_own" on public.offshore_visit_requests;
create policy "offshore_visits_select_own" on public.offshore_visit_requests for select to authenticated
  using (requester_id = auth.uid());
drop policy if exists "offshore_visits_select_admin" on public.offshore_visit_requests;
create policy "offshore_visits_select_admin" on public.offshore_visit_requests for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin()));
drop policy if exists "offshore_visits_insert" on public.offshore_visit_requests;
create policy "offshore_visits_insert" on public.offshore_visit_requests for insert to authenticated
  with check (requester_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "offshore_visits_update_own" on public.offshore_visit_requests;
create policy "offshore_visits_update_own" on public.offshore_visit_requests for update to authenticated
  using (requester_id = auth.uid() and status = 'requested')
  with check (requester_id = auth.uid());
drop policy if exists "offshore_visits_admin" on public.offshore_visit_requests;
create policy "offshore_visits_admin" on public.offshore_visit_requests for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));

-- Allocations: tenant reads (for availability), admins/safety admins manage.
drop policy if exists "offshore_alloc_select" on public.offshore_bed_allocations;
create policy "offshore_alloc_select" on public.offshore_bed_allocations for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "offshore_alloc_admin" on public.offshore_bed_allocations;
create policy "offshore_alloc_admin" on public.offshore_bed_allocations for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));
