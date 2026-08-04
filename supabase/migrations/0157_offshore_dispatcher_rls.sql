-- =============================================================================
-- Row-level security for the Offshore Dispatcher.
--
-- The Dispatcher runs crew rotation, travel & manifests and the offshore-staff
-- roster in full, but only *views* POB / live board and accommodation. RLS is
-- the real boundary (a browser Supabase client could otherwise write directly),
-- so we grant DB write access on exactly the full-section tables and nothing
-- more:
--
--   WRITE (added):  crews, staff, trips, visit_requests, manifests,
--                   manifest_pax, rotation_flags
--   WRITE (kept manager-only): rooms, bed_allocations, installations,
--                   emergency_roles, emergency_teams, muster_*, meal_entries
--
-- Reads need no change: every offshore table already has a tenant-wide SELECT
-- policy, except the tenant-wide reads of trips & visit_requests which are
-- manager-gated — those two are widened to the Dispatcher here so the
-- management POB / manifest / travel screens are populated.
-- =============================================================================

-- Full offshore managers plus the Dispatcher. Mirrors is_offshore_manager()'s
-- shape; used only on the sections the Dispatcher fully manages.
create or replace function public.is_offshore_dispatcher() returns boolean
  language sql stable set search_path = '' as $$
  select public.is_offshore_manager() or public.has_role('dispatcher');
$$;

-- Full-section management policies: super admin anywhere; otherwise an offshore
-- manager OR the Dispatcher within their own tenant.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('offshore_crews',          'offshore_crews_admin'),
      ('offshore_staff',          'offshore_staff_admin'),
      ('offshore_trips',          'offshore_trips_admin'),
      ('offshore_visit_requests', 'offshore_visits_admin'),
      ('offshore_manifests',      'offshore_manifests_admin'),
      ('offshore_manifest_pax',   'offshore_manifest_pax_admin'),
      ('offshore_rotation_flags', 'rotation_flags_manage')
    ) as v(tbl, pol)
  loop
    execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using (
          (select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id())
              and (select public.is_offshore_dispatcher()))
        )
        with check (
          (select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id())
              and (select public.is_offshore_dispatcher()))
        )
    $f$, t.pol, t.tbl);
  end loop;
end$$;

-- Tenant-wide reads of trips & visit requests (the only offshore reads that are
-- manager-gated rather than tenant-wide) — widen to include the Dispatcher.
drop policy if exists "offshore_trips_select_admin" on public.offshore_trips;
create policy "offshore_trips_select_admin" on public.offshore_trips for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.is_offshore_dispatcher())
  );

drop policy if exists "offshore_visits_select_admin" on public.offshore_visit_requests;
create policy "offshore_visits_select_admin" on public.offshore_visit_requests for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.is_offshore_dispatcher())
  );
