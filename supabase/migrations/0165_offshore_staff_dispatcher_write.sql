-- =============================================================================
-- Restore the Dispatcher's write access to the offshore-staff roster.
--
-- 0157 gave the Dispatcher full write on the roster by rebuilding
-- `offshore_staff_admin` around is_offshore_dispatcher(). 0164 then split that
-- FOR ALL policy per action so the registrar arm could be scoped to
-- non-rotational rows — but it rebuilt the manager arm from the *pre-0157*
-- condition, is_offshore_manager(). Applied in order, 0164 therefore silently
-- dropped the Dispatcher's roster writes, contradicting DISPATCHER_VIEW_PERMS
-- (roster: "full") and their whole reason for existing.
--
-- The split from 0164 is kept; only the manager arm widens back to
-- is_offshore_dispatcher(), which is is_offshore_manager() OR the dispatcher
-- role — so full managers are unaffected and the registrar arm is untouched.
-- =============================================================================

drop policy if exists "offshore_staff_insert" on public.offshore_staff;
create policy "offshore_staff_insert" on public.offshore_staff for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_offshore_dispatcher())
        -- Registrars may only ever create non-rotators.
        or (not is_rotational and (select public.has_module_permission('offshore', 'create')))
      )
    )
  );

drop policy if exists "offshore_staff_update" on public.offshore_staff;
create policy "offshore_staff_update" on public.offshore_staff for update to authenticated
  using (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_offshore_dispatcher())
        or (not is_rotational and (select public.has_module_permission('offshore', 'create')))
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_offshore_dispatcher())
        or (not is_rotational and (select public.has_module_permission('offshore', 'create')))
      )
    )
  );

-- Removing someone from the roster follows the same authority as adding them.
drop policy if exists "offshore_staff_delete" on public.offshore_staff;
create policy "offshore_staff_delete" on public.offshore_staff for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_dispatcher()))
  );
