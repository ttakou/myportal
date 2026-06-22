-- =============================================================================
-- Let front-line "operate" staff (e.g. a Security / reception access role) see
-- and check visitors in/out.
--
-- Until now visitor reads/writes were limited to the host (own visitors) or a
-- tenant admin. Security guards are neither, so they could not check a visitor
-- out. Access roles already carry granular per-module verbs (tenant_roles.
-- permissions); this wires the `visitors:operate` verb into the table's RLS so
-- a holder can view the whole tenant's visitors and update them (check in/out).
--
-- Assigning is pure config: grant an access role the Visitors module with the
-- Operate permission in the RBAC matrix, then assign it to your security staff.
-- =============================================================================

-- Does the signed-in user hold `p_verb` on `p_module` via any of their access
-- roles? Mirrors getMyPermissions() in the app. SECURITY DEFINER so it can read
-- the role tables without widening their RLS (and avoids recursion).
create or replace function public.has_module_permission(p_module text, p_verb text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profile_access_roles par
    join public.tenant_roles tr on tr.id = par.role_id
    where par.profile_id = auth.uid()
      and tr.tenant_id = public.current_tenant_id()
      and (tr.permissions -> p_module) ? p_verb
  );
$$;
revoke all on function public.has_module_permission(text, text) from public, anon;
grant execute on function public.has_module_permission(text, text) to authenticated;

-- Operate holders can see every visitor in their tenant (to find who to check
-- out) and update them (check in / check out). Insert/cancel stay with
-- create/edit holders, hosts and admins.
drop policy if exists "visitors_select_operate" on public.visitors;
create policy "visitors_select_operate" on public.visitors for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_module_permission('visitors', 'operate')
  );

drop policy if exists "visitors_update_operate" on public.visitors;
create policy "visitors_update_operate" on public.visitors for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_module_permission('visitors', 'operate')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_module_permission('visitors', 'operate')
  );
