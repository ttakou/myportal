-- =============================================================================
-- Canteen: composable dish options (grouped modifiers)
-- A dish has option groups (e.g. "Protein", "Sides"); each group sets how many
-- of its options may be chosen. "Can't pick meat and chicken" = a Protein group
-- with min_select=1, max_select=1.
-- =============================================================================

create table if not exists public.canteen_option_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  dish_id     uuid not null references public.canteen_dishes (id) on delete cascade,
  name        text not null,
  min_select  integer not null default 0 check (min_select >= 0),
  max_select  integer not null default 1 check (max_select >= 1),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint canteen_option_group_minmax check (max_select >= min_select)
);
create index if not exists idx_canteen_option_groups_dish on public.canteen_option_groups (dish_id);

create table if not exists public.canteen_options (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  group_id    uuid not null references public.canteen_option_groups (id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_canteen_options_group on public.canteen_options (group_id);

create table if not exists public.canteen_booking_options (
  booking_id uuid not null references public.canteen_bookings (id) on delete cascade,
  option_id  uuid not null references public.canteen_options (id) on delete cascade,
  primary key (booking_id, option_id)
);
create index if not exists idx_canteen_booking_options_option on public.canteen_booking_options (option_id);

-- Fill tenant_id from parents -------------------------------------------------
create or replace function public.canteen_fill_option_group()
returns trigger language plpgsql set search_path = '' as $$
begin
  select tenant_id into new.tenant_id from public.canteen_dishes where id = new.dish_id;
  if new.tenant_id is null then raise exception 'Dish % not found', new.dish_id; end if;
  return new;
end;
$$;
drop trigger if exists trg_canteen_fill_option_group on public.canteen_option_groups;
create trigger trg_canteen_fill_option_group
  before insert or update of dish_id on public.canteen_option_groups
  for each row execute function public.canteen_fill_option_group();

create or replace function public.canteen_fill_option()
returns trigger language plpgsql set search_path = '' as $$
begin
  select tenant_id into new.tenant_id from public.canteen_option_groups where id = new.group_id;
  if new.tenant_id is null then raise exception 'Group % not found', new.group_id; end if;
  return new;
end;
$$;
drop trigger if exists trg_canteen_fill_option on public.canteen_options;
create trigger trg_canteen_fill_option
  before insert or update of group_id on public.canteen_options
  for each row execute function public.canteen_fill_option();

-- RLS ------------------------------------------------------------------------
alter table public.canteen_option_groups   enable row level security;
alter table public.canteen_options          enable row level security;
alter table public.canteen_booking_options  enable row level security;

drop policy if exists "canteen_option_groups_select" on public.canteen_option_groups;
create policy "canteen_option_groups_select" on public.canteen_option_groups for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "canteen_option_groups_admin_write" on public.canteen_option_groups;
create policy "canteen_option_groups_admin_write" on public.canteen_option_groups for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

drop policy if exists "canteen_options_select" on public.canteen_options;
create policy "canteen_options_select" on public.canteen_options for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "canteen_options_admin_write" on public.canteen_options;
create policy "canteen_options_admin_write" on public.canteen_options for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

drop policy if exists "canteen_booking_options_select" on public.canteen_booking_options;
create policy "canteen_booking_options_select" on public.canteen_booking_options for select to authenticated
  using (exists (
    select 1 from public.canteen_bookings b
    where b.id = booking_id
      and (b.profile_id = auth.uid()
           or (b.tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  ));
drop policy if exists "canteen_booking_options_write" on public.canteen_booking_options;
create policy "canteen_booking_options_write" on public.canteen_booking_options for all to authenticated
  using (exists (select 1 from public.canteen_bookings b where b.id = booking_id and b.profile_id = auth.uid()))
  with check (exists (select 1 from public.canteen_bookings b where b.id = booking_id and b.profile_id = auth.uid()));

-- Atomic booking with option validation --------------------------------------
create or replace function public.canteen_book(
  p_dish_id uuid,
  p_guest_count integer default 0,
  p_guest_names text[] default '{}',
  p_option_ids uuid[] default '{}'
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dish    public.canteen_dishes%rowtype;
  v_uid     uuid := auth.uid();
  v_booking uuid;
  g         record;
begin
  select * into v_dish from public.canteen_dishes where id = p_dish_id;
  if not found or not v_dish.is_active then
    raise exception 'Dish is not available';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_option_ids, '{}')) as u(oid)
    where u.oid not in (
      select o.id from public.canteen_options o
      join public.canteen_option_groups grp on grp.id = o.group_id
      where grp.dish_id = p_dish_id and o.is_active
    )
  ) then
    raise exception 'One or more options are invalid for this dish';
  end if;

  for g in
    select grp.name, grp.min_select, grp.max_select,
      (select count(*) from unnest(coalesce(p_option_ids,'{}')) as u(oid)
         join public.canteen_options o on o.id = u.oid
        where o.group_id = grp.id) as chosen
    from public.canteen_option_groups grp
    where grp.dish_id = p_dish_id
  loop
    if g.chosen < g.min_select then
      raise exception 'Choose at least % option(s) for %', g.min_select, g.name;
    end if;
    if g.chosen > g.max_select then
      raise exception 'Choose at most % option(s) for %', g.max_select, g.name;
    end if;
  end loop;

  update public.canteen_bookings set status = 'cancelled'
   where profile_id = v_uid and service_date = v_dish.service_date
     and meal_period = v_dish.meal_period and status <> 'cancelled';

  insert into public.canteen_bookings (profile_id, dish_id, guest_count, guest_names)
  values (v_uid, p_dish_id,
          greatest(0, least(10, coalesce(p_guest_count, 0))),
          coalesce(p_guest_names, '{}'))
  returning id into v_booking;

  if array_length(p_option_ids, 1) is not null then
    insert into public.canteen_booking_options (booking_id, option_id)
    select v_booking, u.oid from unnest(p_option_ids) as u(oid);
  end if;

  return v_booking;
end;
$$;

-- Per-option demand for the campboss (RLS of caller applies) -----------------
create or replace view public.canteen_option_demand
with (security_invoker = true) as
  select
    o.id          as option_id,
    o.tenant_id,
    d.service_date,
    d.meal_period,
    d.id          as dish_id,
    d.name        as dish_name,
    g.name        as group_name,
    o.name        as option_name,
    count(bo.booking_id) filter (where b.status <> 'cancelled') as picks
  from public.canteen_options o
  join public.canteen_option_groups g on g.id = o.group_id
  join public.canteen_dishes d on d.id = g.dish_id
  left join public.canteen_booking_options bo on bo.option_id = o.id
  left join public.canteen_bookings b on b.id = bo.booking_id
  group by o.id, o.tenant_id, d.service_date, d.meal_period, d.id, d.name, g.name, o.name;

-- Realtime for live option counts.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='canteen_booking_options'
  ) then
    alter publication supabase_realtime add table public.canteen_booking_options;
  end if;
end$$;
