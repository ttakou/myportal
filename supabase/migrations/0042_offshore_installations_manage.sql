-- =============================================================================
-- Make offshore installations configurable by the offshore managers.
-- Broaden the write policy to tenant admins AND safety admins, matching the
-- crews/rooms/roster tables, and add a lifecycle status nicety (capacity edits
-- already supported by the existing columns).
-- =============================================================================

drop policy if exists "offshore_inst_admin" on public.offshore_installations;
create policy "offshore_inst_admin" on public.offshore_installations for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));
