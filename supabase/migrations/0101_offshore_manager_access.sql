-- Restrict all offshore-trip functionality to Campboss or OIM (admins keep access).
--
-- Previously offshore tables granted management to `is_safety_admin()`
-- (tenant/system admin OR the safety_admin functional role). The offshore camp
-- is run by the Campboss, so we introduce `is_offshore_manager()` — tenant admin,
-- system admin, `campboss` or `oim` — and swap it into every offshore policy.
-- Emergency / EESS tables keep `is_safety_admin()` and are intentionally not
-- touched here.

-- Mirrors is_safety_admin()'s shape (admins always included), but gated on the
-- offshore roles instead of safety_admin.
create or replace function public.is_offshore_manager() returns boolean
  language sql stable set search_path = '' as $$
  select public.is_tenant_admin()
      or public.has_role('system_admin')
      or public.has_role('campboss')
      or public.has_role('oim');
$$;

-- Standard management policies: super admin anywhere; otherwise an offshore
-- manager within their own tenant.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('offshore_bed_allocations', 'offshore_alloc_admin'),
      ('offshore_crews',           'offshore_crews_admin'),
      ('offshore_emergency_roles', 'offshore_emergency_roles_admin'),
      ('offshore_installations',   'offshore_inst_admin'),
      ('offshore_manifest_pax',    'offshore_manifest_pax_admin'),
      ('offshore_manifests',       'offshore_manifests_admin'),
      ('offshore_muster_checkins', 'muster_checkins_admin'),
      ('offshore_muster_drills',   'muster_drills_admin'),
      ('offshore_rooms',           'offshore_rooms_admin'),
      ('offshore_staff',           'offshore_staff_admin'),
      ('offshore_trips',           'offshore_trips_admin'),
      ('offshore_visit_requests',  'offshore_visits_admin')
    ) as v(tbl, pol)
  loop
    execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using (
          (select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id())
              and (select public.is_offshore_manager()))
        )
        with check (
          (select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id())
              and (select public.is_offshore_manager()))
        )
    $f$, t.pol, t.tbl);
  end loop;
end$$;

-- Catering keeps the canteen manager alongside offshore managers.
drop policy if exists "offshore_meals_admin" on public.offshore_meal_entries;
create policy "offshore_meals_admin" on public.offshore_meal_entries for all to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_offshore_manager()) or (select public.is_canteen_manager())))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_offshore_manager()) or (select public.is_canteen_manager())))
  );

-- Tenant-wide read for offshore managers (replaces the safety_admin/oim reads).
drop policy if exists "offshore_trips_select_admin" on public.offshore_trips;
create policy "offshore_trips_select_admin" on public.offshore_trips for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.is_offshore_manager())
  );

drop policy if exists "offshore_visits_select_admin" on public.offshore_visit_requests;
create policy "offshore_visits_select_admin" on public.offshore_visit_requests for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.is_offshore_manager())
  );
