-- =============================================================================
-- Public storage bucket for tenant logos. Writes go through the service-role
-- client in a server action (after verifying the caller is a tenant admin),
-- so no object-level policies are needed; public read serves the logo.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;
