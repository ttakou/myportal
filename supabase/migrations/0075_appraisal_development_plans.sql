-- 0075: Individual development plans (IDPs) tied to an appraisal.

create table public.appraisal_development_plans (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  area         text not null,
  action       text,
  target_date  date,
  status       text not null default 'planned' check (status in ('planned','in_progress','done')),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index on public.appraisal_development_plans(appraisal_id);

alter table public.appraisal_development_plans enable row level security;

create policy "adp_all" on public.appraisal_development_plans for all to authenticated
  using (public.appraisal_participant(appraisal_id))
  with check (tenant_id = public.current_tenant_id() and public.appraisal_participant(appraisal_id));
