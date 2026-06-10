-- Module: Fitness to Work & Medical — confidential statuses + expiry warnings
do $$
begin
  if not exists (select 1 from pg_type where typname='fitness_status') then
    create type public.fitness_status as enum ('fit','fit_with_restrictions','unfit','pending');
  end if;
end$$;

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  fitness_status public.fitness_status not null default 'pending',
  exam_date date not null default current_date, expiry_date date,
  restrictions text, notes text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_medical_profile on public.medical_records(profile_id, exam_date desc);

alter table public.medical_records enable row level security;
drop policy if exists "medical_select_own" on public.medical_records;
create policy "medical_select_own" on public.medical_records for select to authenticated using (profile_id = auth.uid());
drop policy if exists "medical_select_admin" on public.medical_records;
create policy "medical_select_admin" on public.medical_records for select to authenticated
  using (tenant_id=public.current_tenant_id() and public.is_tenant_admin());
drop policy if exists "medical_admin_write" on public.medical_records;
create policy "medical_admin_write" on public.medical_records for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));

create or replace view public.medical_current with (security_invoker = true) as
  select distinct on (m.profile_id)
    m.id, m.tenant_id, m.profile_id, m.fitness_status, m.exam_date, m.expiry_date,
    m.restrictions, m.notes, p.full_name as person_name, p.email as person_email
  from public.medical_records m join public.profiles p on p.id = m.profile_id
  order by m.profile_id, m.exam_date desc, m.created_at desc;
