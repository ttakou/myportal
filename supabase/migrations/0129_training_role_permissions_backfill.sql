-- =============================================================================
-- Backfill training permissions for roles that already grant the module.
--
-- The Training & Competence module was added to roles' `module_slugs` (so it
-- shows in the nav and the page opens), but the permission matrix
-- (`tenant_roles.permissions`) was never seeded with training verbs. As a
-- result employees could open "My Training" yet hit "You don't have permission
-- to do this." when submitting a request / self-enrolling / uploading a cert,
-- because those self-service actions gate on `training:create`.
--
-- Give every role that already exposes the training module the self-service
-- baseline (view + create), matching how their other modules are configured.
-- Roles that should administer training (catalogue, approvals) are granted
-- `training:manage` separately by a tenant admin.
-- =============================================================================

update public.tenant_roles
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{training}',
  '["view","create"]'::jsonb,
  true
)
where module_slugs @> array['training']::text[]
  and not (coalesce(permissions, '{}'::jsonb) ? 'training');
