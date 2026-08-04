-- =============================================================================
-- Platform performance pass (companion to 0160's offshore pass): the
-- remaining findings from the database performance linter.
--
-- 1. Cover every remaining unindexed foreign key (training, savings,
--    performance/appraisals, reports, visitors). Unindexed FKs make joins and
--    cascading deletes scan the child table.
--
-- 2. Recreate the 22 policies flagged for per-row auth re-evaluation
--    (auth_rls_initplan): each bare auth.uid() / helper call becomes
--    (select ...) so Postgres evaluates it once per statement, not once per
--    row. Conditions are otherwise byte-identical — no access change.
-- =============================================================================

-- ---- 1. Foreign-key indexes --------------------------------------------------

-- Performance / appraisals
create index if not exists idx_appraisal_cycles_rating_scale on public.appraisal_cycles (rating_scale_id);
create index if not exists idx_appraisal_cycles_template on public.appraisal_cycles (template_id);
create index if not exists idx_calibration_groups_cycle on public.calibration_groups (cycle_id);
create index if not exists idx_calibration_panel_members_member on public.calibration_panel_members (member_id);
create index if not exists idx_calibration_panel_members_tenant on public.calibration_panel_members (tenant_id);
create index if not exists idx_calibration_panel_ratings_appraisal on public.calibration_panel_ratings (appraisal_id);
create index if not exists idx_calibration_panel_ratings_member on public.calibration_panel_ratings (member_id);
create index if not exists idx_calibration_panel_ratings_tenant on public.calibration_panel_ratings (tenant_id);
create index if not exists idx_continuous_activities_appraisal on public.continuous_activities (appraisal_id);
create index if not exists idx_continuous_activities_counterpart on public.continuous_activities (counterpart_id);
create index if not exists idx_cycle_templates_published_by on public.cycle_templates (published_by);
create index if not exists idx_cycle_templates_rating_scale on public.cycle_templates (rating_scale_id);
create index if not exists idx_goal_templates_published_by on public.goal_templates (published_by);
create index if not exists idx_rating_scales_published_by on public.rating_scales (published_by);
create index if not exists idx_report_definitions_created_by on public.report_definitions (created_by);

-- Savings
create index if not exists idx_savings_audit_log_actor on public.savings_audit_log (actor_id);
create index if not exists idx_savings_goals_profile on public.savings_goals (profile_id);
create index if not exists idx_savings_import_approvals_decided_by on public.savings_import_approvals (decided_by);
create index if not exists idx_savings_import_approvals_tenant on public.savings_import_approvals (tenant_id);
create index if not exists idx_savings_import_batches_created_by on public.savings_import_batches (created_by);
create index if not exists idx_ssv_tenant on public.savings_statement_verifications (tenant_id);
create index if not exists idx_swr_account on public.savings_withdrawal_requests (account_id);
create index if not exists idx_swr_decided_by on public.savings_withdrawal_requests (decided_by);
create index if not exists idx_swr_released_by on public.savings_withdrawal_requests (released_by);
create index if not exists idx_swr_transaction on public.savings_withdrawal_requests (transaction_id);

-- Training
create index if not exists idx_training_competencies_tenant on public.training_competencies (tenant_id);
create index if not exists idx_training_course_comp_competency on public.training_course_competencies (competency_id);
create index if not exists idx_training_course_comp_tenant on public.training_course_competencies (tenant_id);
create index if not exists idx_training_courses_default_trainer on public.training_courses (default_trainer_id);
create index if not exists idx_training_courses_provider on public.training_courses (provider_id);
create index if not exists idx_training_emp_comp_assessed_by on public.training_employee_competencies (assessed_by);
create index if not exists idx_training_emp_comp_competency on public.training_employee_competencies (competency_id);
create index if not exists idx_training_emp_comp_tenant on public.training_employee_competencies (tenant_id);
create index if not exists idx_training_evaluations_participant on public.training_evaluations (participant_id);
create index if not exists idx_training_evaluations_profile on public.training_evaluations (profile_id);
create index if not exists idx_training_evaluations_session on public.training_evaluations (session_id);
create index if not exists idx_training_evaluations_tenant on public.training_evaluations (tenant_id);
create index if not exists idx_training_participants_tenant on public.training_participants (tenant_id);
create index if not exists idx_training_plan_items_course on public.training_plan_items (course_id);
create index if not exists idx_training_plan_items_session on public.training_plan_items (session_id);
create index if not exists idx_training_plan_items_tenant on public.training_plan_items (tenant_id);
create index if not exists idx_training_providers_tenant on public.training_providers (tenant_id);
create index if not exists idx_training_records_tenant on public.training_records (tenant_id);
create index if not exists idx_training_requests_course on public.training_requests (course_id);
create index if not exists idx_training_requests_decided_by on public.training_requests (decided_by);
create index if not exists idx_training_requests_manager on public.training_requests (manager_id);
create index if not exists idx_training_requests_tenant on public.training_requests (tenant_id);
create index if not exists idx_training_requirements_tenant on public.training_requirements (tenant_id);
create index if not exists idx_training_sessions_provider on public.training_sessions (provider_id);
create index if not exists idx_training_sessions_tenant on public.training_sessions (tenant_id);
create index if not exists idx_training_sessions_trainer on public.training_sessions (trainer_id);
create index if not exists idx_training_trainers_profile on public.training_trainers (profile_id);
create index if not exists idx_training_trainers_provider on public.training_trainers (provider_id);
create index if not exists idx_training_trainers_tenant on public.training_trainers (tenant_id);

-- Visitors
create index if not exists idx_visitor_checkins_created_by on public.visitor_checkins (created_by);

-- ---- 2. Per-statement auth evaluation in flagged policies --------------------

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "medsched_select_own" on public.medical_schedules;
create policy "medsched_select_own" on public.medical_schedules for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "savings_goal_own" on public.savings_goals;
create policy "savings_goal_own" on public.savings_goals for all to authenticated
  using (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()))
  with check (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));

drop policy if exists "sib_select" on public.savings_import_batches;
create policy "sib_select" on public.savings_import_batches for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or created_by = (select auth.uid())))
  );

drop policy if exists "ssv_owner_admin_read" on public.savings_statement_verifications;
create policy "ssv_owner_admin_read" on public.savings_statement_verifications for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
    or (select public.is_super_admin())
  );

drop policy if exists "swr_select" on public.savings_withdrawal_requests;
create policy "swr_select" on public.savings_withdrawal_requests for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );

drop policy if exists "swr_insert_own" on public.savings_withdrawal_requests;
create policy "swr_insert_own" on public.savings_withdrawal_requests for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.savings_accounts a
      where a.id = savings_withdrawal_requests.account_id
        and a.profile_id = (select auth.uid())
    )
  );

drop policy if exists "training_participants_select_own" on public.training_participants;
create policy "training_participants_select_own" on public.training_participants for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "training_participants_enrol_self" on public.training_participants;
create policy "training_participants_enrol_self" on public.training_participants for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.training_sessions s
      where s.id = training_participants.session_id
        and s.tenant_id = (select public.current_tenant_id())
        and s.status = 'open'::public.training_session_status
    )
  );

drop policy if exists "training_participants_update_self" on public.training_participants;
create policy "training_participants_update_self" on public.training_participants for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (
    profile_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and status = 'cancelled'::public.training_participant_status
  );

drop policy if exists "training_records_select_own" on public.training_records;
create policy "training_records_select_own" on public.training_records for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "training_records_insert_self" on public.training_records;
create policy "training_records_insert_self" on public.training_records for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and source = 'self'::text
    and verified = false
  );

drop policy if exists "training_requests_select_own" on public.training_requests;
create policy "training_requests_select_own" on public.training_requests for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "training_requests_insert_self" on public.training_requests;
create policy "training_requests_insert_self" on public.training_requests for insert to authenticated
  with check (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));

drop policy if exists "training_requests_cancel_own" on public.training_requests;
create policy "training_requests_cancel_own" on public.training_requests for update to authenticated
  using (
    profile_id = (select auth.uid())
    and status = any (array['requested'::public.training_request_status, 'manager_approved'::public.training_request_status])
  )
  with check (
    profile_id = (select auth.uid())
    and status = 'cancelled'::public.training_request_status
  );

drop policy if exists "training_plan_items_select_own" on public.training_plan_items;
create policy "training_plan_items_select_own" on public.training_plan_items for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "training_employee_competencies_select_own" on public.training_employee_competencies;
create policy "training_employee_competencies_select_own" on public.training_employee_competencies for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "training_emp_comp_insert_self" on public.training_employee_competencies;
create policy "training_emp_comp_insert_self" on public.training_employee_competencies for insert to authenticated
  with check (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));

drop policy if exists "training_emp_comp_update_self" on public.training_employee_competencies;
create policy "training_emp_comp_update_self" on public.training_employee_competencies for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "training_evaluations_select_own" on public.training_evaluations;
create policy "training_evaluations_select_own" on public.training_evaluations for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "training_evaluations_insert_self" on public.training_evaluations;
create policy "training_evaluations_insert_self" on public.training_evaluations for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.training_participants p
      where p.session_id = training_evaluations.session_id
        and p.profile_id = (select auth.uid())
    )
  );

drop policy if exists "visitor_checkins_access" on public.visitor_checkins;
create policy "visitor_checkins_access" on public.visitor_checkins for all to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.visitors v
      where v.id = visitor_checkins.visitor_id
        and (
          v.host_id = (select auth.uid())
          or v.created_by = (select auth.uid())
          or (v.tenant_id = (select public.current_tenant_id())
              and ((select public.is_tenant_admin())
                   or (select public.has_module_permission('visitors', 'operate'))))
        )
    )
  )
  with check (
    (select public.is_super_admin())
    or exists (
      select 1 from public.visitors v
      where v.id = visitor_checkins.visitor_id
        and (
          v.host_id = (select auth.uid())
          or v.created_by = (select auth.uid())
          or (v.tenant_id = (select public.current_tenant_id())
              and ((select public.is_tenant_admin())
                   or (select public.has_module_permission('visitors', 'operate'))))
        )
    )
  );
