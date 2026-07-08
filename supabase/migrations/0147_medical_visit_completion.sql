-- Per-visit completion for the medical schedule. Either the employee (their own)
-- or a tenant/system admin (medical officer) may mark a visit done.
alter table public.medical_schedules
  add column if not exists visit1_completed_at timestamptz,
  add column if not exists visit1_completed_by uuid,
  add column if not exists visit2_completed_at timestamptz,
  add column if not exists visit2_completed_by uuid;

-- Employees may only flip the completion flag on their OWN row (never edit the
-- dates set by the admin), so the write goes through this SECURITY DEFINER
-- function which authorises owner-or-admin and touches only the completion
-- columns. Admins keep full write via the existing medsched_admin_write policy.
create or replace function public.mark_medical_visit(
  p_schedule_id uuid,
  p_visit integer,
  p_completed boolean
) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_tenant uuid;
begin
  select profile_id, tenant_id into v_owner, v_tenant
  from public.medical_schedules where id = p_schedule_id;
  if v_owner is null then
    raise exception 'Schedule not found';
  end if;

  if not (
    v_owner = auth.uid()
    or (select public.is_super_admin())
    or (v_tenant = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  ) then
    raise exception 'Not authorized';
  end if;

  if p_visit = 1 then
    update public.medical_schedules set
      visit1_completed_at = case when p_completed then now() else null end,
      visit1_completed_by = case when p_completed then auth.uid() else null end
    where id = p_schedule_id;
  elsif p_visit = 2 then
    update public.medical_schedules set
      visit2_completed_at = case when p_completed then now() else null end,
      visit2_completed_by = case when p_completed then auth.uid() else null end
    where id = p_schedule_id;
  else
    raise exception 'Invalid visit number';
  end if;
end $$;

grant execute on function public.mark_medical_visit(uuid, integer, boolean) to authenticated;
