-- =============================================================================
-- Offshore catering — Daily Meal Sheet.
--
-- One row per person per day per installation, marking the meals they are
-- entitled to: breakfast (05:00), snack (09:00), lunch (11:30), dinner (17:30)
-- and lodging. Generated from POB; the galley can toggle items (e.g. a
-- half-day visitor or crew-change day may skip some meals).
-- =============================================================================

create table if not exists public.offshore_meal_entries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  installation_id uuid not null references public.offshore_installations(id) on delete cascade,
  meal_date       date not null,
  person_name     text not null,
  category        text not null default 'staff'
                  check (category in ('staff','visitor','casual')),
  breakfast       boolean not null default true,
  snack           boolean not null default true,
  lunch           boolean not null default true,
  dinner          boolean not null default true,
  lodging         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (installation_id, meal_date, person_name)
);
create index if not exists idx_offshore_meals_day
  on public.offshore_meal_entries(tenant_id, installation_id, meal_date);

drop trigger if exists trg_offshore_meals_updated_at on public.offshore_meal_entries;
create trigger trg_offshore_meals_updated_at before update on public.offshore_meal_entries
  for each row execute function public.set_updated_at();

alter table public.offshore_meal_entries enable row level security;

-- Tenant reads; tenant/safety admins and canteen managers manage.
drop policy if exists "offshore_meals_select" on public.offshore_meal_entries;
create policy "offshore_meals_select" on public.offshore_meal_entries for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "offshore_meals_admin" on public.offshore_meal_entries;
create policy "offshore_meals_admin" on public.offshore_meal_entries for all to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_tenant_admin() or public.is_safety_admin() or public.is_canteen_manager()))
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_tenant_admin() or public.is_safety_admin() or public.is_canteen_manager()))
  );
