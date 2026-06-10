-- =============================================================================
-- Sprint 2: Canteen Management
-- Dual kitchen (Local/Chinese), dated menus, 1-dish-per-meal bookings, guest
-- seats, and a security-invoker demand view for the realtime campboss dashboard.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'canteen_kitchen_kind') then
    create type public.canteen_kitchen_kind as enum ('local','chinese');
  end if;
  if not exists (select 1 from pg_type where typname = 'meal_period') then
    create type public.meal_period as enum ('breakfast','lunch','dinner');
  end if;
  if not exists (select 1 from pg_type where typname = 'canteen_booking_status') then
    create type public.canteen_booking_status as enum ('booked','served','cancelled');
  end if;
end$$;

-- Kitchens ------------------------------------------------------------------
create table if not exists public.canteen_kitchens (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  kind       public.canteen_kitchen_kind not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint canteen_kitchens_tenant_kind_unique unique (tenant_id, kind)
);
create index if not exists idx_canteen_kitchens_tenant on public.canteen_kitchens (tenant_id);

-- Dishes (the dated menu) ---------------------------------------------------
create table if not exists public.canteen_dishes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  kitchen_id   uuid not null references public.canteen_kitchens (id) on delete cascade,
  service_date date not null,
  meal_period  public.meal_period not null,
  name         text not null,
  description  text,
  capacity     integer check (capacity is null or capacity >= 0), -- null = unlimited
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_canteen_dishes_menu
  on public.canteen_dishes (tenant_id, service_date, meal_period);

drop trigger if exists trg_canteen_dishes_updated_at on public.canteen_dishes;
create trigger trg_canteen_dishes_updated_at
  before update on public.canteen_dishes
  for each row execute function public.set_updated_at();

-- Bookings ------------------------------------------------------------------
create table if not exists public.canteen_bookings (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  profile_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  dish_id      uuid not null references public.canteen_dishes (id) on delete cascade,
  kitchen_id   uuid not null references public.canteen_kitchens (id) on delete cascade,
  service_date date not null,
  meal_period  public.meal_period not null,
  guest_count  integer not null default 0 check (guest_count between 0 and 10),
  guest_names  text[] not null default '{}',
  status       public.canteen_booking_status not null default 'booked',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 1-dish restriction: at most one active booking per person per meal per day.
create unique index if not exists canteen_one_dish_per_meal
  on public.canteen_bookings (tenant_id, profile_id, service_date, meal_period)
  where status <> 'cancelled';
create index if not exists idx_canteen_bookings_demand
  on public.canteen_bookings (tenant_id, service_date, meal_period);

drop trigger if exists trg_canteen_bookings_updated_at on public.canteen_bookings;
create trigger trg_canteen_bookings_updated_at
  before update on public.canteen_bookings
  for each row execute function public.set_updated_at();

-- Keep denormalized fields consistent with the chosen dish ------------------
create or replace function public.canteen_fill_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d public.canteen_dishes%rowtype;
begin
  select * into d from public.canteen_dishes where id = new.dish_id;
  if not found then
    raise exception 'Dish % does not exist', new.dish_id;
  end if;
  if not d.is_active then
    raise exception 'Dish % is not available', d.name;
  end if;
  new.tenant_id    := d.tenant_id;
  new.kitchen_id   := d.kitchen_id;
  new.service_date := d.service_date;
  new.meal_period  := d.meal_period;
  return new;
end;
$$;

drop trigger if exists trg_canteen_fill_booking on public.canteen_bookings;
create trigger trg_canteen_fill_booking
  before insert or update of dish_id on public.canteen_bookings
  for each row execute function public.canteen_fill_booking();

-- Demand view for the campboss dashboard (RLS of caller applies) ------------
create or replace view public.canteen_dish_demand
with (security_invoker = true) as
  select
    d.id           as dish_id,
    d.tenant_id,
    d.service_date,
    d.meal_period,
    d.name         as dish_name,
    d.capacity,
    k.id           as kitchen_id,
    k.name         as kitchen_name,
    k.kind         as kitchen_kind,
    count(b.id) filter (where b.status <> 'cancelled')                          as headcount,
    coalesce(sum(b.guest_count) filter (where b.status <> 'cancelled'), 0)      as guests,
    count(b.id) filter (where b.status <> 'cancelled')
      + coalesce(sum(b.guest_count) filter (where b.status <> 'cancelled'), 0)  as total_covers
  from public.canteen_dishes d
  join public.canteen_kitchens k on k.id = d.kitchen_id
  left join public.canteen_bookings b on b.dish_id = d.id
  group by d.id, d.tenant_id, d.service_date, d.meal_period, d.name, d.capacity,
           k.id, k.name, k.kind;

-- RLS -----------------------------------------------------------------------
alter table public.canteen_kitchens enable row level security;
alter table public.canteen_dishes   enable row level security;
alter table public.canteen_bookings enable row level security;

-- kitchens: tenant read, admin write
drop policy if exists "canteen_kitchens_select" on public.canteen_kitchens;
create policy "canteen_kitchens_select" on public.canteen_kitchens for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "canteen_kitchens_admin_write" on public.canteen_kitchens;
create policy "canteen_kitchens_admin_write" on public.canteen_kitchens for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

-- dishes: tenant read, admin write
drop policy if exists "canteen_dishes_select" on public.canteen_dishes;
create policy "canteen_dishes_select" on public.canteen_dishes for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "canteen_dishes_admin_write" on public.canteen_dishes;
create policy "canteen_dishes_admin_write" on public.canteen_dishes for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

-- bookings: employees manage their own; admins (campboss) see/manage all in tenant
drop policy if exists "canteen_bookings_select_own" on public.canteen_bookings;
create policy "canteen_bookings_select_own" on public.canteen_bookings for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists "canteen_bookings_select_admin" on public.canteen_bookings;
create policy "canteen_bookings_select_admin" on public.canteen_bookings for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

drop policy if exists "canteen_bookings_insert_self" on public.canteen_bookings;
create policy "canteen_bookings_insert_self" on public.canteen_bookings for insert to authenticated
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());

drop policy if exists "canteen_bookings_update_own" on public.canteen_bookings;
create policy "canteen_bookings_update_own" on public.canteen_bookings for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "canteen_bookings_admin_write" on public.canteen_bookings;
create policy "canteen_bookings_admin_write" on public.canteen_bookings for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

-- Realtime: stream booking changes to the campboss dashboard ----------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'canteen_bookings'
  ) then
    alter publication supabase_realtime add table public.canteen_bookings;
  end if;
end$$;
