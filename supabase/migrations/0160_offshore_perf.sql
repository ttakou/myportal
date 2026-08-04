-- =============================================================================
-- Offshore performance pass: FK indexes + RLS policy consolidation.
--
-- 1. Missing foreign-key indexes (flagged by the database linter): the three
--    FKs on offshore_rotation_flags, and access_delegations.tenant_id (0159
--    indexed the two party FKs but not the tenant).
--
-- 2. Every offshore table carried a `FOR ALL` admin policy *alongside* its
--    SELECT policy, so each read evaluated two permissive policies (three on
--    offshore_trips / offshore_visit_requests). Postgres must OR every
--    permissive policy per row. This rewrites the offshore tables to ONE
--    policy per action:
--      - SELECT: the existing tenant-wide policy already covers managers and
--        (via its own OR) super admins, so the admin FOR ALL's read arm was
--        pure overhead — dropped.
--      - INSERT / UPDATE / DELETE: recreated as per-action policies with the
--        same admin condition the FOR ALL carried (dispatcher-level on the
--        crew/travel/roster tables per 0157, manager-level elsewhere).
--      - offshore_trips / offshore_visit_requests: own + admin arms merged
--        into a single policy per action.
--    Every function call is wrapped in (select ...) so it is evaluated once
--    per statement, not per row (rotation_flags / emergency_teams were bare).
--
-- 3. The access_delegations policies (0159) rewritten with the same
--    (select ...) wrapping before they ever ship unwrapped.
--
-- No access-level change: each new policy's condition is byte-for-byte the
-- condition the dropped policy carried, only reorganised per action.
-- =============================================================================

-- ---- 1. Missing FK indexes ---------------------------------------------------

create index if not exists idx_rotation_flags_installation on public.offshore_rotation_flags (installation_id);
create index if not exists idx_rotation_flags_created_by   on public.offshore_rotation_flags (created_by);
create index if not exists idx_rotation_flags_resolved_by  on public.offshore_rotation_flags (resolved_by);
create index if not exists idx_access_delegations_tenant   on public.access_delegations (tenant_id);

-- ---- 2. One policy per action ------------------------------------------------

-- Manager-gated tables: writes need admin / Campboss / OIM.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('offshore_bed_allocations', 'offshore_alloc_admin'),
      ('offshore_rooms',           'offshore_rooms_admin'),
      ('offshore_installations',   'offshore_inst_admin'),
      ('offshore_emergency_roles', 'offshore_emergency_roles_admin'),
      ('offshore_muster_checkins', 'muster_checkins_admin'),
      ('offshore_muster_drills',   'muster_drills_admin')
    ) as v(tbl, pol)
  loop
    execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_manager())))
    $f$, t.tbl || '_write_ins', t.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_manager())))
        with check ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_manager())))
    $f$, t.tbl || '_write_upd', t.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_manager())))
    $f$, t.tbl || '_write_del', t.tbl);
  end loop;
end$$;

-- Dispatcher-gated tables (crew rotation / roster / travel, per 0157): writes
-- need manager OR dispatcher.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('offshore_crews',          'offshore_crews_admin'),
      ('offshore_staff',          'offshore_staff_admin'),
      ('offshore_manifests',      'offshore_manifests_admin'),
      ('offshore_manifest_pax',   'offshore_manifest_pax_admin'),
      ('offshore_rotation_flags', 'rotation_flags_manage')
    ) as v(tbl, pol)
  loop
    execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher())))
    $f$, t.tbl || '_write_ins', t.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher())))
        with check ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher())))
    $f$, t.tbl || '_write_upd', t.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher())))
    $f$, t.tbl || '_write_del', t.tbl);
  end loop;
end$$;

-- rotation_flags SELECT (0152) called its functions unwrapped — rewrap.
drop policy if exists "rotation_flags_select" on public.offshore_rotation_flags;
create policy "rotation_flags_select" on public.offshore_rotation_flags for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_super_admin()));

-- ---- offshore_trips: 5 policies -> 4 (one per action) ------------------------

drop policy if exists "offshore_trips_admin" on public.offshore_trips;
drop policy if exists "offshore_trips_select_admin" on public.offshore_trips;
drop policy if exists "offshore_trips_select_own" on public.offshore_trips;
drop policy if exists "offshore_trips_insert" on public.offshore_trips;
drop policy if exists "offshore_trips_update_own" on public.offshore_trips;

create policy "offshore_trips_select" on public.offshore_trips for select to authenticated
  using (
    profile_id = (select auth.uid())
    or requester_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );

create policy "offshore_trips_insert" on public.offshore_trips for insert to authenticated
  with check (
    (tenant_id = (select public.current_tenant_id())
      and (profile_id = (select auth.uid()) or requester_id = (select auth.uid())))
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );

create policy "offshore_trips_update" on public.offshore_trips for update to authenticated
  using (
    ((profile_id = (select auth.uid()) or requester_id = (select auth.uid()))
      and status = 'requested'::public.offshore_status)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  )
  with check (
    profile_id = (select auth.uid())
    or requester_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );

create policy "offshore_trips_delete" on public.offshore_trips for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );

-- ---- offshore_visit_requests: 5 policies -> 4 --------------------------------

drop policy if exists "offshore_visits_admin" on public.offshore_visit_requests;
drop policy if exists "offshore_visits_select_admin" on public.offshore_visit_requests;
drop policy if exists "offshore_visits_select_own" on public.offshore_visit_requests;
drop policy if exists "offshore_visits_insert" on public.offshore_visit_requests;
drop policy if exists "offshore_visits_update_own" on public.offshore_visit_requests;

create policy "offshore_visits_select" on public.offshore_visit_requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );

create policy "offshore_visits_insert" on public.offshore_visit_requests for insert to authenticated
  with check (
    (requester_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()))
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );

create policy "offshore_visits_update" on public.offshore_visit_requests for update to authenticated
  using (
    (requester_id = (select auth.uid()) and status = 'requested')
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  )
  with check (
    requester_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );

create policy "offshore_visits_delete" on public.offshore_visit_requests for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );

-- ---- Bespoke admin conditions ------------------------------------------------

-- Catering: offshore manager OR canteen manager.
drop policy if exists "offshore_meals_admin" on public.offshore_meal_entries;
create policy "offshore_meals_write_ins" on public.offshore_meal_entries for insert to authenticated
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_offshore_manager()) or (select public.is_canteen_manager()))));
create policy "offshore_meals_write_upd" on public.offshore_meal_entries for update to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_offshore_manager()) or (select public.is_canteen_manager()))))
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_offshore_manager()) or (select public.is_canteen_manager()))));
create policy "offshore_meals_write_del" on public.offshore_meal_entries for delete to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_offshore_manager()) or (select public.is_canteen_manager()))));

-- Emergency teams: tenant admin OR safety admin (0102), previously unwrapped.
drop policy if exists "offshore_emergency_teams_admin" on public.offshore_emergency_teams;
drop policy if exists "offshore_emergency_teams_select" on public.offshore_emergency_teams;
create policy "offshore_emergency_teams_select" on public.offshore_emergency_teams for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_super_admin()));
create policy "offshore_emergency_teams_write_ins" on public.offshore_emergency_teams for insert to authenticated
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.is_safety_admin()))));
create policy "offshore_emergency_teams_write_upd" on public.offshore_emergency_teams for update to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.is_safety_admin()))))
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.is_safety_admin()))));
create policy "offshore_emergency_teams_write_del" on public.offshore_emergency_teams for delete to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.is_safety_admin()))));

-- Helicopter flights: tenant admin.
drop policy if exists "heli_admin" on public.helicopter_flights;
create policy "heli_write_ins" on public.helicopter_flights for insert to authenticated
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));
create policy "heli_write_upd" on public.helicopter_flights for update to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));
create policy "heli_write_del" on public.helicopter_flights for delete to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));

-- ---- 3. access_delegations policies rewrapped (initplan-safe) ----------------

drop policy if exists "access_delegations_select" on public.access_delegations;
create policy "access_delegations_select" on public.access_delegations for select to authenticated
  using (
    delegator_id = (select auth.uid())
    or delegate_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );

drop policy if exists "access_delegations_insert" on public.access_delegations;
create policy "access_delegations_insert" on public.access_delegations for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and (
      delegator_id = (select auth.uid())
      or (select public.is_super_admin())
      or (select public.is_tenant_admin())
    )
  );

drop policy if exists "access_delegations_update" on public.access_delegations;
create policy "access_delegations_update" on public.access_delegations for update to authenticated
  using (
    delegator_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  )
  with check (
    delegator_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );

drop policy if exists "access_delegations_delete" on public.access_delegations;
create policy "access_delegations_delete" on public.access_delegations for delete to authenticated
  using (
    delegator_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );

drop policy if exists "profile_access_roles_select_delegate" on public.profile_access_roles;
create policy "profile_access_roles_select_delegate" on public.profile_access_roles for select to authenticated
  using (profile_id in (select public.delegators_for((select auth.uid()))));

drop policy if exists "profile_roles_select_delegate" on public.profile_roles;
create policy "profile_roles_select_delegate" on public.profile_roles for select to authenticated
  using (profile_id in (select public.delegators_for((select auth.uid()))));
