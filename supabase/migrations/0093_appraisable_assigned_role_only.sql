-- =============================================================================
-- Appraisable roster = staff with an ASSIGNED access role that grants Performance.
--
-- 0091 treated a user with NO access roles as "unrestricted" and therefore
-- appraisable. In practice the Performance roster should be only the people who
-- have been explicitly granted a Performance-capable access role (e.g. APCC
-- Staff) — not everyone who simply has no role assigned. This drops the
-- "no access roles" branch so only an assigned role granting `performance:view`
-- (still employee_type 'employee') puts a name on the roster.
-- =============================================================================

create or replace function public.appraisable_profiles()
returns table(id uuid, manager_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.id, p.manager_id
  from public.profiles p
  where p.tenant_id = public.current_tenant_id()
    and p.is_active
    and p.employee_type = 'employee'
    and exists (
      select 1
      from public.profile_access_roles par
      join public.tenant_roles tr on tr.id = par.role_id
      where par.profile_id = p.id
        and (tr.permissions -> 'performance') ? 'view'
    );
$$;
