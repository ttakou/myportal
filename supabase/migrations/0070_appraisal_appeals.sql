-- 0070: Appraisals Phase 4a — formal appeal / disagreement workflow.

create table public.appraisal_appeals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  reason       text,
  status       text not null default 'open' check (status in ('open','resolved')),
  decision     text,
  opened_by    uuid references public.profiles(id),
  resolved_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index on public.appraisal_appeals(appraisal_id);

alter table public.appraisal_appeals enable row level security;

create policy "aap_select" on public.appraisal_appeals for select to authenticated
  using (public.appraisal_participant(appraisal_id));
create policy "aap_insert" on public.appraisal_appeals for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.appraisal_participant(appraisal_id));
create policy "aap_update" on public.appraisal_appeals for update to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())))
  with check (tenant_id = public.current_tenant_id());
