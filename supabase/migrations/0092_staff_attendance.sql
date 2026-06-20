-- =============================================================================
-- Staff attendance — daily on-site presence for staff (not visitors).
--
-- Companion to the visitor module: guards at the gate check staff in/out, and
-- staff can self check-in ("I'm in") from within the site geofence. One row per
-- staff member per day; status is derived (no check_in = away, check_in &
-- no check_out = on site, check_out set = left).
--
-- Authorization mirrors the visitor table: a person manages their OWN row
-- (self check-in/out), while `visitors:operate` holders (security/reception)
-- and tenant admins manage anyone's — reusing public.has_module_permission().
-- =============================================================================

create table if not exists public.staff_attendance (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  attendance_date  date not null default current_date,
  check_in_at      timestamptz,
  check_out_at     timestamptz,
  check_in_method  text,                                  -- 'self' | 'guard'
  checked_in_by    uuid references public.profiles (id) on delete set null,
  checked_out_by   uuid references public.profiles (id) on delete set null,
  check_in_lat     double precision,
  check_in_lng     double precision,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (profile_id, attendance_date)
);
create index if not exists idx_staff_attendance_day
  on public.staff_attendance (tenant_id, attendance_date);

drop trigger if exists trg_staff_attendance_updated_at on public.staff_attendance;
create trigger trg_staff_attendance_updated_at
  before update on public.staff_attendance
  for each row execute function public.set_updated_at();

alter table public.staff_attendance enable row level security;

-- A person manages their own attendance row (self check-in / check-out).
drop policy if exists "staff_attendance_self" on public.staff_attendance;
create policy "staff_attendance_self" on public.staff_attendance for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());

-- Security / reception (visitors:operate) and admins manage anyone in the tenant.
drop policy if exists "staff_attendance_operate" on public.staff_attendance;
create policy "staff_attendance_operate" on public.staff_attendance for all to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_tenant_admin() or public.has_module_permission('visitors', 'operate')))
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_tenant_admin() or public.has_module_permission('visitors', 'operate')))
  );

-- Realtime so the guard roster (and muster) can update live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_attendance'
  ) then
    alter publication supabase_realtime add table public.staff_attendance;
  end if;
end$$;
