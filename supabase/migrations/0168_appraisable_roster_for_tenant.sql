-- =============================================================================
-- One definition of "who is in the performance workflow", usable from the cron.
--
-- `appraisable_profiles()` resolves the tenant from the caller's JWT, so the
-- nightly sweeps — which run as the service role with no signed-in user — could
-- not use it. They swept every appraisal row instead, including rows belonging
-- to people who cannot open the Performance module at all, and chased them.
--
-- The rule itself is unchanged: an active employee holding an access role that
-- grants `performance: view`. It simply takes the tenant as an argument now, and
-- the original function delegates to it so there is a single source of truth.
-- =============================================================================

create or replace function public.appraisable_profiles_for(p_tenant uuid)
returns table(id uuid, manager_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.id, p.manager_id
  from public.profiles p
  where p.tenant_id = p_tenant
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
revoke all on function public.appraisable_profiles_for(uuid) from public, anon;
grant execute on function public.appraisable_profiles_for(uuid) to authenticated, service_role;

-- The JWT-scoped original now delegates, so the two can never drift apart.
create or replace function public.appraisable_profiles()
returns table(id uuid, manager_id uuid)
language sql stable security definer set search_path = '' as $$
  select * from public.appraisable_profiles_for(public.current_tenant_id());
$$;
revoke all on function public.appraisable_profiles() from public, anon;
grant execute on function public.appraisable_profiles() to authenticated;

comment on function public.appraisable_profiles_for(uuid) is
  'The performance workflow''s population for a tenant: active employees whose access role grants performance:view. Use this from service-role contexts; appraisable_profiles() is the JWT-scoped wrapper.';
