-- =============================================================================
-- Appraisable roster = who can actually access the Performance module.
--
-- A name belongs on the performance/appraisal roster only if the person has at
-- least *view* access to the Performance module. Mirrors the app's access model:
--   * a user with NO access roles is unrestricted (sees every module), and
--   * a user WITH access roles is limited to their roles' grants — so they need
--     a role granting `performance: view`.
-- Contractors and guests are never appraisable (employee_type must be 'employee',
-- which is also how expatriates are stored).
-- =============================================================================

create or replace function public.appraisable_profiles()
returns table(id uuid, manager_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.id, p.manager_id
  from public.profiles p
  where p.tenant_id = public.current_tenant_id()
    and p.is_active
    and p.employee_type = 'employee'
    and (
      -- Unrestricted: no access roles assigned.
      not exists (
        select 1 from public.profile_access_roles par where par.profile_id = p.id
      )
      -- or an assigned access role grants performance view.
      or exists (
        select 1
        from public.profile_access_roles par
        join public.tenant_roles tr on tr.id = par.role_id
        where par.profile_id = p.id
          and (tr.permissions -> 'performance') ? 'view'
      )
    );
$$;
revoke all on function public.appraisable_profiles() from public, anon;
grant execute on function public.appraisable_profiles() to authenticated;
