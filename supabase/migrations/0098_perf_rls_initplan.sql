-- Performance: evaluate auth.uid() once per query, not once per row.
--
-- The performance advisor flagged these policies (auth_rls_initplan): a bare
-- auth.uid() inside a RLS policy is re-evaluated for every candidate row.
-- Wrapping it in a scalar subselect `(select auth.uid())` lets the planner hoist
-- it into a one-time InitPlan, with identical semantics — only the direct
-- auth.uid() calls change. Applied to the database.

alter policy ap_select on public.appraisals
  using (
    is_super_admin() or (
      (tenant_id = current_tenant_id()) and (
        (employee_id = (select auth.uid())) or is_appraisal_manager(manager_id) or is_hr() or is_tenant_admin()
      )
    )
  );

alter policy ap_update on public.appraisals
  using (
    is_super_admin() or (
      (tenant_id = current_tenant_id()) and (
        (employee_id = (select auth.uid())) or is_appraisal_manager(manager_id) or is_hr() or is_tenant_admin()
      )
    )
  )
  with check (tenant_id = current_tenant_id());

alter policy pip_select on public.appraisal_pips
  using (
    is_super_admin() or (
      (tenant_id = current_tenant_id()) and (
        (profile_id = (select auth.uid())) or is_appraisal_manager(manager_id) or is_hr() or is_tenant_admin()
      )
    )
  );

alter policy staff_attendance_self on public.staff_attendance
  using (profile_id = (select auth.uid()))
  with check ((profile_id = (select auth.uid())) and (tenant_id = current_tenant_id()));

alter policy eess_incident_updates_select on public.eess_incident_updates
  using (
    exists (
      select 1 from eess_incidents i
      where i.id = eess_incident_updates.incident_id
        and ((i.reporter_id = (select auth.uid())) or ((i.tenant_id = current_tenant_id()) and is_safety_admin()))
    )
  );

alter policy eess_incident_updates_insert on public.eess_incident_updates
  with check (
    (author_id = (select auth.uid())) and (tenant_id = current_tenant_id()) and exists (
      select 1 from eess_incidents i
      where i.id = eess_incident_updates.incident_id
        and (
          ((i.reporter_id = (select auth.uid())) and (i.status <> 'resolved'::eess_incident_status))
          or ((i.tenant_id = current_tenant_id()) and is_safety_admin())
        )
    )
  );
