-- =============================================================================
-- Training & Competence — employee self-service.
--
-- Extends the module so an employee can drive their own development:
--   * link a training request back to the IDP development-plan row it satisfies
--     (the IDP -> training-request bridge),
--   * self-upload an external certificate (held UNVERIFIED until HR confirms, so
--     it never silently counts toward statutory compliance),
--   * self-enrol into an OPEN session and cancel their own enrolment,
--   * self-assess a competency (kept separate from the validated level), and
--   * submit their own post-training evaluation.
--
-- RLS additions stay narrow: every self-service policy is bounded to
-- profile_id = auth.uid() within the caller's tenant.
-- =============================================================================

-- --- IDP -> training request bridge -----------------------------------------
alter table public.training_requests
  add column if not exists development_plan_id uuid
    references public.appraisal_development_plans(id) on delete set null;

create index if not exists idx_training_requests_dev_plan
  on public.training_requests(development_plan_id);

-- One live request per IDP row (a new one may be raised only after the prior
-- attempt was rejected or cancelled).
create unique index if not exists training_requests_dev_plan_active_uniq
  on public.training_requests(development_plan_id)
  where development_plan_id is not null
    and status in ('requested','manager_approved','approved');

-- --- self-uploaded certificates: verification gate --------------------------
alter table public.training_records
  add column if not exists verified boolean not null default true;

-- Existing/admin records remain verified=true (column default). Self-uploads
-- will set verified=false and source='self'.

-- --- competency self-assessment (kept apart from the validated level) -------
alter table public.training_employee_competencies
  add column if not exists self_level int;
alter table public.training_employee_competencies
  add column if not exists self_assessed_on date;

-- =============================================================================
-- Employee self-service RLS policies
-- =============================================================================

-- Self-enrol into an OPEN session (and only an open one), for oneself.
drop policy if exists "training_participants_enrol_self" on public.training_participants;
create policy "training_participants_enrol_self" on public.training_participants for insert to authenticated
  with check (
    profile_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.training_sessions s
      where s.id = session_id
        and s.tenant_id = public.current_tenant_id()
        and s.status = 'open'
    )
  );

-- Manage / withdraw one's own enrolment.
drop policy if exists "training_participants_update_self" on public.training_participants;
create policy "training_participants_update_self" on public.training_participants for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Self-upload an external certificate — unverified, source 'self', for oneself.
drop policy if exists "training_records_insert_self" on public.training_records;
create policy "training_records_insert_self" on public.training_records for insert to authenticated
  with check (
    profile_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and source = 'self'
    and verified = false
  );

-- Self-assess a competency (insert or update one's own row).
drop policy if exists "training_emp_comp_insert_self" on public.training_employee_competencies;
create policy "training_emp_comp_insert_self" on public.training_employee_competencies for insert to authenticated
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());

drop policy if exists "training_emp_comp_update_self" on public.training_employee_competencies;
create policy "training_emp_comp_update_self" on public.training_employee_competencies for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Submit one's own evaluation for a session one actually took part in.
drop policy if exists "training_evaluations_insert_self" on public.training_evaluations;
create policy "training_evaluations_insert_self" on public.training_evaluations for insert to authenticated
  with check (
    profile_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.training_participants p
      where p.session_id = training_evaluations.session_id
        and p.profile_id = auth.uid()
    )
  );
