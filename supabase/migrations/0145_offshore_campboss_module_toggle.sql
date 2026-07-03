-- Let the Offshore Campboss / OIM turn the Offshore module on or off for their
-- own tenant.
--
-- Until now the module on/off switch (tenant_services.is_active) was writable
-- only by tenant/system admins (policy `tenant_services_admin_write`). The
-- offshore camp is run by the Campboss, so they should be able to enable or
-- disable *their* module without being handed full tenant-admin rights over
-- every other module (savings, medical, canteen, …).
--
-- This adds a second, tightly-scoped write policy: an offshore manager may write
-- the tenant_services row **only** for the 'offshore' service, and **only**
-- within their own tenant. Permissive policies are OR-ed, so admins keep their
-- existing broad access via `tenant_services_admin_write`; this simply widens
-- the offshore row to campboss/OIM. `is_offshore_manager()` already resolves to
-- tenant admin / system admin / campboss / oim (see migration 0101).

drop policy if exists tenant_services_offshore_manager_write on public.tenant_services;
create policy tenant_services_offshore_manager_write on public.tenant_services
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and service_id = (select id from public.services_catalog where slug = 'offshore')
    and (select public.is_offshore_manager())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and service_id = (select id from public.services_catalog where slug = 'offshore')
    and (select public.is_offshore_manager())
  );
