-- =============================================================================
-- Emergency Support (EESS): add the `safety_admin` functional role.
--
-- ALTER TYPE ... ADD VALUE must commit before the new label can be used, so it
-- lives in its own migration ahead of the module that references it.
-- =============================================================================
alter type public.functional_role add value if not exists 'safety_admin';
