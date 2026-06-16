-- Align offshore_trips visibility & management with the rest of the offshore module.
--
-- Safety admins (and OIMs) run POB, manifests, accommodation and muster, so they
-- must be able to read ALL of their tenant's trips. Previously only tenant/super
-- admins could SELECT every trip; a safety_admin saw only their own, which made
-- the POB dashboard and crew-change panel read 0 (looking as if everyone had
-- been demobilised). Sibling tables (offshore_staff/rooms/crews/...) already grant
-- safety_admin management rights, so trips were the lone outlier.

-- Read: own trips, or any tenant trip for safety-admin-level / OIM users.
drop policy if exists offshore_trips_select_admin on offshore_trips;
create policy offshore_trips_select_admin on offshore_trips
  for select
  using (
    tenant_id = current_tenant_id()
    and (is_safety_admin() or has_role('oim'))
  );

-- Manage: super admin anywhere; tenant admin or safety admin within their tenant
-- (mirrors offshore_staff_admin / offshore_rooms_admin etc.).
drop policy if exists offshore_trips_admin on offshore_trips;
create policy offshore_trips_admin on offshore_trips
  for all
  using (
    is_super_admin()
    or (tenant_id = current_tenant_id() and (is_tenant_admin() or is_safety_admin()))
  )
  with check (
    is_super_admin()
    or (tenant_id = current_tenant_id() and (is_tenant_admin() or is_safety_admin()))
  );
