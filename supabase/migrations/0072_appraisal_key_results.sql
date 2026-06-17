-- 0072: Integrate OKRs into the appraisal — key results, business alignment,
-- evidence, and an objective kind (objective vs development goal).

alter table public.appraisal_goals
  add column if not exists alignment         text,
  add column if not exists evidence_required text,
  add column if not exists kind              text not null default 'objective'
                           check (kind in ('objective','development'));

create table public.appraisal_key_results (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  appraisal_id  uuid not null references public.appraisals(id) on delete cascade,
  goal_id       uuid not null references public.appraisal_goals(id) on delete cascade,
  title         text not null,
  target        text,
  current_value text,
  unit          text,
  progress      smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.appraisal_key_results(goal_id);
create index on public.appraisal_key_results(appraisal_id);

alter table public.appraisal_key_results enable row level security;

create policy "akr_all" on public.appraisal_key_results for all to authenticated
  using (public.appraisal_participant(appraisal_id))
  with check (tenant_id = public.current_tenant_id() and public.appraisal_participant(appraisal_id));
