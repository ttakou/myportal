-- 0078: Auto-assigned "Witness" access role for goal assessors.
--
-- When an employee attaches a colleague as a stakeholder reviewer on an
-- objective, that colleague needs to actually reach the appraisals page to give
-- their rating. Under strict module gating a user only sees a module their
-- access roles grant, so we auto-grant a view-only "Witness" role (performance
-- module) tied to having at least one live reviewer assignment.

-- Grant the Witness role to a reviewer. SECURITY DEFINER because the attaching
-- employee is not an admin and cannot normally write role assignments. The grant
-- only happens when p_rater is genuinely a reviewer on an appraisal the caller is
-- entitled to act on (their own, as manager, or HR/admin).
create or replace function public.ensure_witness_role(p_rater uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   uuid;
begin
  if v_tenant is null or p_rater is null then
    return;
  end if;

  if not exists (
    select 1
    from public.appraisal_goal_raters r
    join public.appraisals a on a.id = r.appraisal_id
    where r.rater_id = p_rater
      and r.tenant_id = v_tenant
      and (a.employee_id = auth.uid() or a.manager_id = auth.uid()
           or public.is_hr() or public.is_tenant_admin() or public.is_super_admin())
  ) then
    return;
  end if;

  select id into v_role
  from public.tenant_roles
  where tenant_id = v_tenant and name = 'Witness';

  if v_role is null then
    insert into public.tenant_roles (tenant_id, name, description, module_slugs, permissions)
    values (
      v_tenant,
      'Witness',
      'Auto-assigned to goal assessors so they can rate colleagues'' objectives.',
      array['performance'],
      '{"performance":["view"]}'::jsonb
    )
    returning id into v_role;
  end if;

  insert into public.profile_access_roles (profile_id, role_id, tenant_id)
  values (p_rater, v_role, v_tenant)
  on conflict do nothing;
end;
$$;
revoke execute on function public.ensure_witness_role(uuid) from anon;

-- Remove the auto Witness role once a person has no remaining reviewer
-- assignments, so the Performance module stops showing in their nav.
create or replace function public.revoke_witness_role_if_unused(p_rater uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   uuid;
begin
  if v_tenant is null or p_rater is null then
    return;
  end if;

  if exists (
    select 1 from public.appraisal_goal_raters
    where rater_id = p_rater and tenant_id = v_tenant
  ) then
    return; -- still assessing something — keep the role
  end if;

  select id into v_role
  from public.tenant_roles
  where tenant_id = v_tenant and name = 'Witness';
  if v_role is null then
    return;
  end if;

  delete from public.profile_access_roles
  where profile_id = p_rater and role_id = v_role and tenant_id = v_tenant;
end;
$$;
revoke execute on function public.revoke_witness_role_if_unused(uuid) from anon;
