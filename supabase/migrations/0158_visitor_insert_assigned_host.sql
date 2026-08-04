-- =============================================================================
-- Let reception register a visitor under the *assigned* host.
--
-- The original insert policy (0005) only accepted `host_id = auth.uid()` (or a
-- tenant admin), so a receptionist — who is neither the host nor an admin —
-- could only ever create a visitor with themselves as host. When they assigned
-- the real host in the form, the insert was rejected by RLS.
--
-- Reception already holds the `visitors:create` (or `operate`) verb via an
-- access role, and the update policy (0090) trusts those verbs. Extend the same
-- trust to INSERT so a create/operate holder may record any host in their
-- tenant. Self-hosting (an employee pre-registering their own visitor) and the
-- tenant-admin path are preserved.
-- =============================================================================

drop policy if exists "visitors_insert" on public.visitors;
create policy "visitors_insert" on public.visitors for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (
      host_id = auth.uid()
      or public.is_tenant_admin()
      or public.has_module_permission('visitors', 'create')
      or public.has_module_permission('visitors', 'operate')
    )
  );
