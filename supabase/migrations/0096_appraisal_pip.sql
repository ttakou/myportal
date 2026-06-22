-- =============================================================================
-- Performance Improvement Plan (PIP) — a formal corrective-action track, distinct
-- from the development plan. A manager (or HR) opens a PIP for an employee with a
-- concern, expectations, support and a review date; it's worked to an outcome.
-- =============================================================================

create table if not exists public.appraisal_pips (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,  -- employee
  manager_id   uuid references public.profiles (id) on delete set null,
  concern      text not null,
  expectations text,
  support      text,
  start_date   date not null default current_date,
  review_date  date,
  status       text not null default 'open'
                 check (status in ('open', 'met', 'not_met', 'cancelled')),
  outcome      text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_appraisal_pips_profile on public.appraisal_pips (profile_id);
create index if not exists idx_appraisal_pips_tenant on public.appraisal_pips (tenant_id, status);

drop trigger if exists trg_appraisal_pips_updated_at on public.appraisal_pips;
create trigger trg_appraisal_pips_updated_at
  before update on public.appraisal_pips
  for each row execute function public.set_updated_at();

alter table public.appraisal_pips enable row level security;

-- The employee sees their own PIPs (read-only); their manager (or delegate) and
-- HR/admin see and manage them.
drop policy if exists "pip_select" on public.appraisal_pips;
create policy "pip_select" on public.appraisal_pips for select to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (profile_id = auth.uid() or public.is_appraisal_manager(manager_id)
             or public.is_hr() or public.is_tenant_admin()))
  );

drop policy if exists "pip_write" on public.appraisal_pips;
create policy "pip_write" on public.appraisal_pips for all to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_appraisal_manager(manager_id) or public.is_hr() or public.is_tenant_admin()))
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_appraisal_manager(manager_id) or public.is_hr() or public.is_tenant_admin()))
  );
