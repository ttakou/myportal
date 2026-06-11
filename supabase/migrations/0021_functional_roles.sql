-- =============================================================================
-- Functional roles (RBAC): Canteen Staff/Manager, HR, Finance, System Admin.
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname='functional_role') then
    create type public.functional_role as enum
      ('canteen_staff','canteen_manager','hr_admin','finance','system_admin');
  end if;
end$$;

create table if not exists public.profile_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.functional_role not null,
  created_at timestamptz not null default now(),
  constraint profile_roles_unique unique (profile_id, role)
);
create index if not exists idx_profile_roles_profile on public.profile_roles(profile_id);

create or replace function public.profile_roles_fill_tenant()
returns trigger language plpgsql set search_path = '' as $$
begin
  select tenant_id into new.tenant_id from public.profiles where id = new.profile_id;
  return new;
end; $$;
drop trigger if exists trg_profile_roles_fill_tenant on public.profile_roles;
create trigger trg_profile_roles_fill_tenant before insert on public.profile_roles
  for each row execute function public.profile_roles_fill_tenant();

create or replace function private.uid_has_role(r public.functional_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = r);
$$;
grant execute on function private.uid_has_role(public.functional_role) to authenticated;

create or replace function public.has_role(r public.functional_role)
returns boolean language sql stable set search_path = '' as $$ select private.uid_has_role(r); $$;
create or replace function public.is_system_admin() returns boolean language sql stable set search_path='' as $$
  select public.is_tenant_admin() or public.has_role('system_admin'); $$;
create or replace function public.is_canteen_manager() returns boolean language sql stable set search_path='' as $$
  select public.is_tenant_admin() or public.has_role('canteen_manager') or public.has_role('system_admin'); $$;
create or replace function public.is_canteen_staff() returns boolean language sql stable set search_path='' as $$
  select public.is_canteen_manager() or public.has_role('canteen_staff'); $$;
create or replace function public.is_hr() returns boolean language sql stable set search_path='' as $$
  select public.is_tenant_admin() or public.has_role('hr_admin') or public.has_role('system_admin'); $$;
create or replace function public.is_finance() returns boolean language sql stable set search_path='' as $$
  select public.is_tenant_admin() or public.has_role('finance') or public.has_role('system_admin'); $$;

alter table public.profile_roles enable row level security;
drop policy if exists "profile_roles_select" on public.profile_roles;
create policy "profile_roles_select" on public.profile_roles for select to authenticated
  using (profile_id = auth.uid() or public.is_hr());
drop policy if exists "profile_roles_write" on public.profile_roles;
create policy "profile_roles_write" on public.profile_roles for all to authenticated
  using (public.is_hr()) with check (public.is_hr());

-- Broaden canteen write/read + feedback + profiles to functional roles
drop policy if exists "canteen_kitchens_admin_write" on public.canteen_kitchens;
create policy "canteen_kitchens_admin_write" on public.canteen_kitchens for all to authenticated
  using (public.is_canteen_manager()) with check (public.is_canteen_manager());
drop policy if exists "canteen_dishes_admin_write" on public.canteen_dishes;
create policy "canteen_dishes_admin_write" on public.canteen_dishes for all to authenticated
  using (public.is_canteen_manager()) with check (public.is_canteen_manager());
drop policy if exists "canteen_option_groups_admin_write" on public.canteen_option_groups;
create policy "canteen_option_groups_admin_write" on public.canteen_option_groups for all to authenticated
  using (public.is_canteen_manager()) with check (public.is_canteen_manager());
drop policy if exists "canteen_options_admin_write" on public.canteen_options;
create policy "canteen_options_admin_write" on public.canteen_options for all to authenticated
  using (public.is_canteen_manager()) with check (public.is_canteen_manager());
drop policy if exists "canteen_bookings_admin_write" on public.canteen_bookings;
create policy "canteen_bookings_admin_write" on public.canteen_bookings for all to authenticated
  using (public.is_canteen_staff()) with check (public.is_canteen_staff());
drop policy if exists "canteen_bookings_select_admin" on public.canteen_bookings;
create policy "canteen_bookings_select_admin" on public.canteen_bookings for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_canteen_staff() or public.is_finance()));
drop policy if exists "feedback_admin_write" on public.canteen_feedback;
create policy "feedback_admin_write" on public.canteen_feedback for all to authenticated
  using (public.is_canteen_manager()) with check (public.is_canteen_manager());
drop policy if exists "feedback_select_admin" on public.canteen_feedback;
create policy "feedback_select_admin" on public.canteen_feedback for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_canteen_manager() or public.is_finance()));

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_hr()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_hr()));

-- Public bucket serves by URL without a listing policy.
drop policy if exists "meal_photos_read" on storage.objects;
