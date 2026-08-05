-- =============================================================================
-- RLS consolidation for the canteen, savings and training modules — companion
-- to 0160 (offshore). Every table here carried a FOR ALL write policy stacked
-- on its SELECT polic(ies), so each read evaluated 2–3 permissive policies per
-- row. This rewrites each table to ONE policy per action.
--
-- Method (identical to 0160): conditions are taken verbatim from the live
-- pg_policies catalog and recombined per action as an exact OR-union of the
-- arms that previously granted that action. No access-level change — including
-- pre-existing quirks (e.g. canteen role checks that carry no tenant filter),
-- which are preserved as-is and flagged separately rather than silently fixed.
-- All function calls are wrapped in (select ...) for once-per-statement
-- evaluation; the row-dependent is_my_training_report(profile_id) stays a
-- direct call by necessity.
-- =============================================================================

-- ---- Canteen: manager catalog tables (dishes / kitchens / options) -----------
-- Old: tenant-wide SELECT + is_canteen_manager() FOR ALL. The manager arm also
-- granted (quirky but pre-existing) cross-tenant manager reads — preserved.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('canteen_dishes',        'canteen_dishes_admin_write',        'canteen_dishes_select'),
      ('canteen_kitchens',      'canteen_kitchens_admin_write',      'canteen_kitchens_select'),
      ('canteen_option_groups', 'canteen_option_groups_admin_write', 'canteen_option_groups_select'),
      ('canteen_options',       'canteen_options_admin_write',       'canteen_options_select')
    ) as v(tbl, wpol, spol)
  loop
    execute format('drop policy if exists %I on public.%I', t.wpol, t.tbl);
    execute format('drop policy if exists %I on public.%I', t.spol, t.tbl);
    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (tenant_id = (select public.current_tenant_id())
          or (select public.is_super_admin())
          or (select public.is_canteen_manager()))
    $f$, t.spol, t.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check ((select public.is_canteen_manager()))
    $f$, t.wpol || '_ins', t.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using ((select public.is_canteen_manager()))
        with check ((select public.is_canteen_manager()))
    $f$, t.wpol || '_upd', t.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using ((select public.is_canteen_manager()))
    $f$, t.wpol || '_del', t.tbl);
  end loop;
end$$;

-- ---- canteen_bookings: 5 policies -> 4 ---------------------------------------
drop policy if exists "canteen_bookings_admin_write" on public.canteen_bookings;
drop policy if exists "canteen_bookings_select_admin" on public.canteen_bookings;
drop policy if exists "canteen_bookings_select_own" on public.canteen_bookings;
drop policy if exists "canteen_bookings_insert_self" on public.canteen_bookings;
drop policy if exists "canteen_bookings_update_own" on public.canteen_bookings;

create policy "canteen_bookings_select" on public.canteen_bookings for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_canteen_staff())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_finance()))
  );
create policy "canteen_bookings_insert" on public.canteen_bookings for insert to authenticated
  with check (
    (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()))
    or (select public.is_canteen_staff())
  );
create policy "canteen_bookings_update" on public.canteen_bookings for update to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_canteen_staff()))
  with check (profile_id = (select auth.uid()) or (select public.is_canteen_staff()));
create policy "canteen_bookings_delete" on public.canteen_bookings for delete to authenticated
  using ((select public.is_canteen_staff()));

-- ---- canteen_booking_options: split the own-booking FOR ALL ------------------
drop policy if exists "canteen_booking_options_write" on public.canteen_booking_options;
create policy "canteen_booking_options_ins" on public.canteen_booking_options for insert to authenticated
  with check (exists (
    select 1 from public.canteen_bookings b
    where b.id = canteen_booking_options.booking_id and b.profile_id = (select auth.uid())));
create policy "canteen_booking_options_upd" on public.canteen_booking_options for update to authenticated
  using (exists (
    select 1 from public.canteen_bookings b
    where b.id = canteen_booking_options.booking_id and b.profile_id = (select auth.uid())))
  with check (exists (
    select 1 from public.canteen_bookings b
    where b.id = canteen_booking_options.booking_id and b.profile_id = (select auth.uid())));
create policy "canteen_booking_options_del" on public.canteen_booking_options for delete to authenticated
  using (exists (
    select 1 from public.canteen_bookings b
    where b.id = canteen_booking_options.booking_id and b.profile_id = (select auth.uid())));

-- ---- canteen_feedback: 4 policies -> 4 (one per action) ----------------------
drop policy if exists "feedback_admin_write" on public.canteen_feedback;
drop policy if exists "feedback_select_admin" on public.canteen_feedback;
drop policy if exists "feedback_select_own" on public.canteen_feedback;
drop policy if exists "feedback_insert" on public.canteen_feedback;

create policy "feedback_select" on public.canteen_feedback for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_canteen_manager())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_finance()))
  );
create policy "feedback_insert" on public.canteen_feedback for insert to authenticated
  with check (
    (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()))
    or (select public.is_canteen_manager())
  );
create policy "feedback_update" on public.canteen_feedback for update to authenticated
  using ((select public.is_canteen_manager()))
  with check ((select public.is_canteen_manager()));
create policy "feedback_delete" on public.canteen_feedback for delete to authenticated
  using ((select public.is_canteen_manager()));

-- ---- canteen entitlements / redemptions: split the HR / staff FOR ALL --------
-- (their SELECT policies already cover the write policies' read arms)
drop policy if exists "cme_write" on public.canteen_meal_entitlements;
create policy "cme_write_ins" on public.canteen_meal_entitlements for insert to authenticated
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_hr())));
create policy "cme_write_upd" on public.canteen_meal_entitlements for update to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_hr())))
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_hr())));
create policy "cme_write_del" on public.canteen_meal_entitlements for delete to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_hr())));

drop policy if exists "cme_redemptions_write" on public.canteen_meal_redemptions;
create policy "cme_redemptions_ins" on public.canteen_meal_redemptions for insert to authenticated
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_canteen_staff())));
create policy "cme_redemptions_upd" on public.canteen_meal_redemptions for update to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_canteen_staff())))
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_canteen_staff())));
create policy "cme_redemptions_del" on public.canteen_meal_redemptions for delete to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_canteen_staff())));

-- ---- Savings: tenant-admin FOR ALL split; super_admin read folded in ---------
-- loans / loan_repayments / savings_accounts / savings_transactions /
-- savings_import_approvals / savings_import_batches share the same admin
-- condition; their selects already include the tenant-admin arm.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('loans',                    'loans_admin'),
      ('loan_repayments',          'loan_repay_admin'),
      ('savings_accounts',         'savings_acct_admin'),
      ('savings_transactions',     'savings_txn_admin'),
      ('savings_import_approvals', 'sia_admin'),
      ('savings_import_batches',   'sib_admin')
    ) as v(tbl, pol)
  loop
    execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
    $f$, t.pol || '_ins', t.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
        with check ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
    $f$, t.pol || '_upd', t.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
    $f$, t.pol || '_del', t.tbl);
  end loop;
end$$;

-- sia_select was still unwrapped — rewrap while touching the table.
drop policy if exists "sia_select" on public.savings_import_approvals;
create policy "sia_select" on public.savings_import_approvals for select to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));

-- Selects that only carried super_admin reads via the dropped FOR ALL: fold it in.
drop policy if exists "loans_select" on public.loans;
create policy "loans_select" on public.loans for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.savings_accounts a
      where a.id = loans.account_id
        and (a.profile_id = (select auth.uid())
             or (a.tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
    )
  );

drop policy if exists "loan_repay_select" on public.loan_repayments;
create policy "loan_repay_select" on public.loan_repayments for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.loans l
      join public.savings_accounts a on a.id = l.account_id
      where l.id = loan_repayments.loan_id
        and (a.profile_id = (select auth.uid())
             or (a.tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
    )
  );

drop policy if exists "savings_acct_select" on public.savings_accounts;
create policy "savings_acct_select" on public.savings_accounts for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );

drop policy if exists "savings_txn_select" on public.savings_transactions;
create policy "savings_txn_select" on public.savings_transactions for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.savings_accounts a
      where a.id = savings_transactions.account_id
        and (a.profile_id = (select auth.uid())
             or (a.tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
    )
  );

-- savings_goals: own FOR ALL split into per-action + one merged select.
drop policy if exists "savings_goal_own" on public.savings_goals;
drop policy if exists "savings_goal_admin_read" on public.savings_goals;
create policy "savings_goal_select" on public.savings_goals for select to authenticated
  using (
    (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()))
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );
create policy "savings_goal_ins" on public.savings_goals for insert to authenticated
  with check (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));
create policy "savings_goal_upd" on public.savings_goals for update to authenticated
  using (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()))
  with check (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));
create policy "savings_goal_del" on public.savings_goals for delete to authenticated
  using (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));

-- savings_withdrawal_requests: merge own + admin arms per action.
drop policy if exists "swr_admin" on public.savings_withdrawal_requests;
drop policy if exists "swr_select" on public.savings_withdrawal_requests;
drop policy if exists "swr_insert_own" on public.savings_withdrawal_requests;
create policy "swr_select" on public.savings_withdrawal_requests for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );
create policy "swr_insert" on public.savings_withdrawal_requests for insert to authenticated
  with check (
    (profile_id = (select auth.uid())
      and tenant_id = (select public.current_tenant_id())
      and exists (
        select 1 from public.savings_accounts a
        where a.id = savings_withdrawal_requests.account_id
          and a.profile_id = (select auth.uid())))
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );
create policy "swr_update" on public.savings_withdrawal_requests for update to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())))
  with check ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));
create policy "swr_delete" on public.savings_withdrawal_requests for delete to authenticated
  using ((select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin())));

-- ---- Training: catalog tables (tenant-wide read, training-admin write) -------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('training_budgets',             'training_budgets_write',             'training_budgets_select'),
      ('training_competencies',        'training_competencies_write',        'training_competencies_select'),
      ('training_course_competencies', 'training_course_competencies_write', 'training_course_competencies_select'),
      ('training_courses',             'training_courses_write',             'training_courses_select'),
      ('training_providers',           'training_providers_write',           'training_providers_select'),
      ('training_requirements',        'training_requirements_write',        'training_requirements_select'),
      ('training_sessions',            'training_sessions_write',            'training_sessions_select'),
      ('training_trainers',            'training_trainers_write',            'training_trainers_select')
    ) as v(tbl, wpol, spol)
  loop
    execute format('drop policy if exists %I on public.%I', t.wpol, t.tbl);
    execute format('drop policy if exists %I on public.%I', t.spol, t.tbl);
    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (tenant_id = (select public.current_tenant_id()) or (select public.is_super_admin()))
    $f$, t.spol, t.tbl);
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id())
              and ((select public.is_tenant_admin())
                   or (select public.has_module_permission('training', 'manage')))))
    $f$, t.wpol || '_ins', t.tbl);
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id())
              and ((select public.is_tenant_admin())
                   or (select public.has_module_permission('training', 'manage')))))
        with check ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id())
              and ((select public.is_tenant_admin())
                   or (select public.has_module_permission('training', 'manage')))))
    $f$, t.wpol || '_upd', t.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using ((select public.is_super_admin())
          or (tenant_id = (select public.current_tenant_id())
              and ((select public.is_tenant_admin())
                   or (select public.has_module_permission('training', 'manage')))))
    $f$, t.wpol || '_del', t.tbl);
  end loop;
end$$;

-- ---- Training: personal tables (own / manager-report / training-admin) -------
-- The shared training-admin condition, used below.
--   (select is_super_admin()) or (tenant & (tenant_admin or training:manage))

-- training_employee_competencies: 5 -> 4
drop policy if exists "training_employee_competencies_admin_all" on public.training_employee_competencies;
drop policy if exists "training_employee_competencies_select_own" on public.training_employee_competencies;
drop policy if exists "training_employee_competencies_select_report" on public.training_employee_competencies;
drop policy if exists "training_emp_comp_insert_self" on public.training_employee_competencies;
drop policy if exists "training_emp_comp_update_self" on public.training_employee_competencies;
create policy "training_emp_comp_select" on public.training_employee_competencies for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_my_training_report(profile_id)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_emp_comp_insert" on public.training_employee_competencies for insert to authenticated
  with check (
    (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()))
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_emp_comp_update" on public.training_employee_competencies for update to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  )
  with check (
    profile_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_emp_comp_delete" on public.training_employee_competencies for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );

-- training_evaluations: 3 -> 3
drop policy if exists "training_evaluations_admin_all" on public.training_evaluations;
drop policy if exists "training_evaluations_select_own" on public.training_evaluations;
drop policy if exists "training_evaluations_insert_self" on public.training_evaluations;
create policy "training_evaluations_select" on public.training_evaluations for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_evaluations_insert" on public.training_evaluations for insert to authenticated
  with check (
    (profile_id = (select auth.uid())
      and tenant_id = (select public.current_tenant_id())
      and exists (
        select 1 from public.training_participants p
        where p.session_id = training_evaluations.session_id and p.profile_id = (select auth.uid())))
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_evaluations_update" on public.training_evaluations for update to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_evaluations_delete" on public.training_evaluations for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );

-- training_participants: 5 -> 4
drop policy if exists "training_participants_admin_all" on public.training_participants;
drop policy if exists "training_participants_select_own" on public.training_participants;
drop policy if exists "training_participants_select_report" on public.training_participants;
drop policy if exists "training_participants_enrol_self" on public.training_participants;
drop policy if exists "training_participants_update_self" on public.training_participants;
create policy "training_participants_select" on public.training_participants for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_my_training_report(profile_id)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_participants_insert" on public.training_participants for insert to authenticated
  with check (
    (profile_id = (select auth.uid())
      and tenant_id = (select public.current_tenant_id())
      and exists (
        select 1 from public.training_sessions s
        where s.id = training_participants.session_id
          and s.tenant_id = (select public.current_tenant_id())
          and s.status = 'open'::public.training_session_status))
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_participants_update" on public.training_participants for update to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  )
  with check (
    (profile_id = (select auth.uid())
      and tenant_id = (select public.current_tenant_id())
      and status = 'cancelled'::public.training_participant_status)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_participants_delete" on public.training_participants for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );

-- training_plan_items: 3 -> 4
drop policy if exists "training_plan_items_admin_all" on public.training_plan_items;
drop policy if exists "training_plan_items_select_own" on public.training_plan_items;
drop policy if exists "training_plan_items_select_report" on public.training_plan_items;
create policy "training_plan_items_select" on public.training_plan_items for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_my_training_report(profile_id)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_plan_items_insert" on public.training_plan_items for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_plan_items_update" on public.training_plan_items for update to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_plan_items_delete" on public.training_plan_items for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );

-- training_records: 4 -> 4
drop policy if exists "training_records_admin_all" on public.training_records;
drop policy if exists "training_records_select_own" on public.training_records;
drop policy if exists "training_records_select_report" on public.training_records;
drop policy if exists "training_records_insert_self" on public.training_records;
create policy "training_records_select" on public.training_records for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_my_training_report(profile_id)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_records_insert" on public.training_records for insert to authenticated
  with check (
    (profile_id = (select auth.uid())
      and tenant_id = (select public.current_tenant_id())
      and source = 'self'::text
      and verified = false)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_records_update" on public.training_records for update to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_records_delete" on public.training_records for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );

-- training_requests: 6 -> 4
drop policy if exists "training_requests_admin_all" on public.training_requests;
drop policy if exists "training_requests_select_own" on public.training_requests;
drop policy if exists "training_requests_select_report" on public.training_requests;
drop policy if exists "training_requests_insert_self" on public.training_requests;
drop policy if exists "training_requests_insert_manager" on public.training_requests;
drop policy if exists "training_requests_cancel_own" on public.training_requests;
drop policy if exists "training_requests_update_manager" on public.training_requests;
create policy "training_requests_select" on public.training_requests for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_my_training_report(profile_id)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_requests_insert" on public.training_requests for insert to authenticated
  with check (
    (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()))
    or (tenant_id = (select public.current_tenant_id())
      and public.is_my_training_report(profile_id)
      and status = any (array['requested'::public.training_request_status, 'manager_approved'::public.training_request_status]))
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_requests_update" on public.training_requests for update to authenticated
  using (
    (profile_id = (select auth.uid())
      and status = any (array['requested'::public.training_request_status, 'manager_approved'::public.training_request_status]))
    or public.is_my_training_report(profile_id)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  )
  with check (
    (profile_id = (select auth.uid()) and status = 'cancelled'::public.training_request_status)
    or public.is_my_training_report(profile_id)
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
create policy "training_requests_delete" on public.training_requests for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_tenant_admin()) or (select public.has_module_permission('training', 'manage'))))
  );
