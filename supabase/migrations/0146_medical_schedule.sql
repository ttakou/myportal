-- Upcoming fitness-to-work / annual-medical schedule per employee: two hospital
-- visits (1st: medical exams; 2nd: consultation & physical screening) plus the
-- exam indicators. Distinct from medical_records, which stores *completed*
-- exams (status, exam date, expiry). This table is the forward schedule and
-- drives the employee's day-of dashboard reminder.
create table if not exists public.medical_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  year integer not null,
  visit1_date date not null,
  visit1_time text,
  visit2_date date,
  visit2_time text,
  exam_indicators text,
  work_location text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, profile_id, year)
);

create index if not exists idx_medsched_v1 on public.medical_schedules(tenant_id, visit1_date);
create index if not exists idx_medsched_v2 on public.medical_schedules(tenant_id, visit2_date);
create index if not exists idx_medsched_profile on public.medical_schedules(profile_id);

alter table public.medical_schedules enable row level security;

-- An employee sees their own schedule (drives the dashboard reminder).
drop policy if exists medsched_select_own on public.medical_schedules;
create policy medsched_select_own on public.medical_schedules
  for select to authenticated using (profile_id = auth.uid());

-- Tenant/system admins see and manage the whole tenant's schedule.
drop policy if exists medsched_select_admin on public.medical_schedules;
create policy medsched_select_admin on public.medical_schedules
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

drop policy if exists medsched_admin_write on public.medical_schedules;
create policy medsched_admin_write on public.medical_schedules
  for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
