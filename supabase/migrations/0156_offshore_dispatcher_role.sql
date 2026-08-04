-- =============================================================================
-- Reusable "Dispatcher" access role, one per tenant.
--
-- Assigning this access role to a user does three things:
--   1. module_slugs = {offshore}  → the middleware + sidebar let them into the
--      Offshore module (and restrict them to it).
--   2. permissions = { offshore: [view] } → they can READ offshore data, but
--      hold no write verb; room / POB mutations therefore stay denied server-
--      side, giving the required read-only POB & accommodation.
--   3. The application maps the role name "Dispatcher" → the `dispatcher`
--      functional role (see ACCESS_ROLE_FUNCTIONAL in admin/actions.ts), which
--      unlocks the offshore management screens and the full crew-rotation /
--      travel / roster write actions.
--
-- Idempotent: tenants that already have a role named "Dispatcher" are skipped.
-- =============================================================================

insert into public.tenant_roles (tenant_id, name, description, module_slugs, permissions)
select
  t.id,
  'Dispatcher',
  'Offshore dispatcher — full crew rotation, travel & manifests and offshore-staff roster; read-only POB, live board and accommodation.',
  array['offshore']::text[],
  '{"offshore":["view"]}'::jsonb
from public.tenants t
on conflict (tenant_id, name) do nothing;
