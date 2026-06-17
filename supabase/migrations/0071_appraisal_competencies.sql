-- 0071: Appraisals Phase 4b — competency framework + per-appraisal ratings.

create table public.appraisal_competencies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.appraisal_competencies(tenant_id);

create table public.appraisal_competency_ratings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  appraisal_id    uuid not null references public.appraisals(id) on delete cascade,
  competency_id   uuid not null references public.appraisal_competencies(id) on delete cascade,
  employee_rating numeric,
  manager_rating  numeric,
  manager_comment text,
  updated_at      timestamptz not null default now(),
  unique (appraisal_id, competency_id)
);
create index on public.appraisal_competency_ratings(appraisal_id);

alter table public.appraisal_competencies        enable row level security;
alter table public.appraisal_competency_ratings  enable row level security;

-- Competencies: tenant-readable, HR/admin managed.
create policy "acomp_select" on public.appraisal_competencies for select to authenticated
  using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "acomp_manage" on public.appraisal_competencies for all to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())))
  with check (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())));

-- Ratings: follow the parent appraisal's participants.
create policy "acr_all" on public.appraisal_competency_ratings for all to authenticated
  using (public.appraisal_participant(appraisal_id))
  with check (tenant_id = public.current_tenant_id() and public.appraisal_participant(appraisal_id));
