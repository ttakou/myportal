-- Module: Performance Management — OKRs, continuous feedback, 9-box grid
do $$
begin
  if not exists (select 1 from pg_type where typname='okr_status') then
    create type public.okr_status as enum ('active','closed');
  end if;
end$$;

create table if not exists public.okr_objectives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null, period text not null default 'Q2 2026',
  status public.okr_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_okr_obj_owner on public.okr_objectives(owner_id);
create table if not exists public.okr_key_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  objective_id uuid not null references public.okr_objectives(id) on delete cascade,
  title text not null, target numeric(14,2) not null default 100, current numeric(14,2) not null default 0,
  unit text, created_at timestamptz not null default now()
);
create index if not exists idx_okr_kr_obj on public.okr_key_results(objective_id);
create table if not exists public.perf_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  body text not null, created_at timestamptz not null default now()
);
create index if not exists idx_perf_feedback_to on public.perf_feedback(to_id, created_at desc);
create table if not exists public.nine_box (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period text not null default 'Q2 2026',
  performance integer not null check (performance between 1 and 3),
  potential integer not null check (potential between 1 and 3),
  note text, set_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint nine_box_unique unique (tenant_id, profile_id, period)
);

drop trigger if exists trg_okr_obj_updated_at on public.okr_objectives;
create trigger trg_okr_obj_updated_at before update on public.okr_objectives for each row execute function public.set_updated_at();
drop trigger if exists trg_nine_box_updated_at on public.nine_box;
create trigger trg_nine_box_updated_at before update on public.nine_box for each row execute function public.set_updated_at();

alter table public.okr_objectives  enable row level security;
alter table public.okr_key_results enable row level security;
alter table public.perf_feedback   enable row level security;
alter table public.nine_box        enable row level security;

drop policy if exists "okr_obj_select" on public.okr_objectives;
create policy "okr_obj_select" on public.okr_objectives for select to authenticated
  using (owner_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id=owner_id and p.manager_id=auth.uid())
         or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "okr_obj_write_own" on public.okr_objectives;
create policy "okr_obj_write_own" on public.okr_objectives for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "okr_obj_admin" on public.okr_objectives;
create policy "okr_obj_admin" on public.okr_objectives for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "okr_kr_select" on public.okr_key_results;
create policy "okr_kr_select" on public.okr_key_results for select to authenticated
  using (exists (select 1 from public.okr_objectives o where o.id=objective_id));
drop policy if exists "okr_kr_write" on public.okr_key_results;
create policy "okr_kr_write" on public.okr_key_results for all to authenticated
  using (exists (select 1 from public.okr_objectives o where o.id=objective_id and (o.owner_id=auth.uid() or (o.tenant_id=public.current_tenant_id() and public.is_tenant_admin()))))
  with check (exists (select 1 from public.okr_objectives o where o.id=objective_id and (o.owner_id=auth.uid() or (o.tenant_id=public.current_tenant_id() and public.is_tenant_admin()))));
drop policy if exists "perf_feedback_select" on public.perf_feedback;
create policy "perf_feedback_select" on public.perf_feedback for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "perf_feedback_insert" on public.perf_feedback;
create policy "perf_feedback_insert" on public.perf_feedback for insert to authenticated
  with check (from_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "nine_box_select" on public.nine_box;
create policy "nine_box_select" on public.nine_box for select to authenticated
  using (profile_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id=profile_id and p.manager_id=auth.uid())
         or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "nine_box_write" on public.nine_box;
create policy "nine_box_write" on public.nine_box for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()) or exists (select 1 from public.profiles p where p.id=profile_id and p.manager_id=auth.uid()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()) or exists (select 1 from public.profiles p where p.id=profile_id and p.manager_id=auth.uid()));
