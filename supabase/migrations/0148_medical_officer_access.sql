-- Let an access role carrying medical permissions (a "Medical Officer") read and
-- manage medical records & schedules via RLS — mirroring the visitors 'operate'
-- pattern (has_module_permission). Admins and own-record access are unchanged.
--
-- The tenant "Medical Officer" access role itself (permissions
-- {"medical":["view","create","manage"]}) is tenant data, created via the Admin
-- → Access Roles screen (or seeded per tenant), not in this migration.

-- medical_records: permission-based read + write.
drop policy if exists medical_select_perm on public.medical_records;
create policy medical_select_perm on public.medical_records for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_module_permission('medical','view'));

drop policy if exists medical_write_perm on public.medical_records;
create policy medical_write_perm on public.medical_records for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_module_permission('medical','create'))
  with check (tenant_id = public.current_tenant_id() and public.has_module_permission('medical','create'));

-- medical_schedules: same, so the officer sees the roster and can record results.
drop policy if exists medsched_select_perm on public.medical_schedules;
create policy medsched_select_perm on public.medical_schedules for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_module_permission('medical','view'));

drop policy if exists medsched_write_perm on public.medical_schedules;
create policy medsched_write_perm on public.medical_schedules for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_module_permission('medical','create'))
  with check (tenant_id = public.current_tenant_id() and public.has_module_permission('medical','create'));

-- Allow medical:create holders (not just admins) to mark scheduled visits complete.
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
    or (v_tenant = (select public.current_tenant_id()) and public.has_module_permission('medical','create'))
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
