-- =============================================================================
-- Module: Out of Town Trip — missions, multi-tier approval, expense reconciliation
-- (see migration history; applied via Supabase). Mirrors the live schema.
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname='trip_status') then
    create type public.trip_status as enum
      ('draft','submitted','manager_approved','finance_approved','rejected','completed');
  end if;
end$$;

create table if not exists public.out_of_town_trips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requester_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  destination text not null, purpose text, depart_date date not null, return_date date,
  estimated_cost numeric(12,2) not null default 0,
  status public.trip_status not null default 'draft',
  manager_approved_by uuid references public.profiles(id) on delete set null, manager_approved_at timestamptz,
  finance_approved_by uuid references public.profiles(id) on delete set null, finance_approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_oott_tenant on public.out_of_town_trips(tenant_id, status);

create table if not exists public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  trip_id uuid not null references public.out_of_town_trips(id) on delete cascade,
  category text not null, amount numeric(12,2) not null default 0, note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_trip_expenses_trip on public.trip_expenses(trip_id);

drop trigger if exists trg_oott_updated_at on public.out_of_town_trips;
create trigger trg_oott_updated_at before update on public.out_of_town_trips
  for each row execute function public.set_updated_at();

create or replace function public.oott_guard_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('manager_approved','rejected')
       and not (public.is_tenant_admin()
                or exists (select 1 from public.profiles p
                           where p.id = old.requester_id and p.manager_id = auth.uid())) then
      raise exception 'Only the manager or an admin can approve/reject this trip';
    end if;
    if new.status in ('finance_approved','completed') and not public.is_tenant_admin() then
      raise exception 'Only finance (admin) can grant this approval';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_oott_guard_status on public.out_of_town_trips;
create trigger trg_oott_guard_status before update on public.out_of_town_trips
  for each row execute function public.oott_guard_status();

alter table public.out_of_town_trips enable row level security;
alter table public.trip_expenses     enable row level security;

drop policy if exists "oott_select_own" on public.out_of_town_trips;
create policy "oott_select_own" on public.out_of_town_trips for select to authenticated using (requester_id = auth.uid());
drop policy if exists "oott_select_manager" on public.out_of_town_trips;
create policy "oott_select_manager" on public.out_of_town_trips for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = requester_id and p.manager_id = auth.uid()));
drop policy if exists "oott_select_admin" on public.out_of_town_trips;
create policy "oott_select_admin" on public.out_of_town_trips for select to authenticated
  using (tenant_id=public.current_tenant_id() and public.is_tenant_admin());
drop policy if exists "oott_insert" on public.out_of_town_trips;
create policy "oott_insert" on public.out_of_town_trips for insert to authenticated
  with check (requester_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "oott_update_own" on public.out_of_town_trips;
create policy "oott_update_own" on public.out_of_town_trips for update to authenticated
  using (requester_id = auth.uid()) with check (requester_id = auth.uid());
drop policy if exists "oott_update_manager" on public.out_of_town_trips;
create policy "oott_update_manager" on public.out_of_town_trips for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = requester_id and p.manager_id = auth.uid()));
drop policy if exists "oott_admin" on public.out_of_town_trips;
create policy "oott_admin" on public.out_of_town_trips for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));

drop policy if exists "trip_expenses_select" on public.trip_expenses;
create policy "trip_expenses_select" on public.trip_expenses for select to authenticated
  using (exists (select 1 from public.out_of_town_trips t where t.id = trip_id));
drop policy if exists "trip_expenses_write" on public.trip_expenses;
create policy "trip_expenses_write" on public.trip_expenses for all to authenticated
  using (exists (select 1 from public.out_of_town_trips t where t.id = trip_id and (t.requester_id = auth.uid() or (t.tenant_id=public.current_tenant_id() and public.is_tenant_admin()))))
  with check (exists (select 1 from public.out_of_town_trips t where t.id = trip_id and (t.requester_id = auth.uid() or (t.tenant_id=public.current_tenant_id() and public.is_tenant_admin()))));
