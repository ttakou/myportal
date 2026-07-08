-- =============================================================================
-- Manager delegate (business continuity): a manager can nominate another
-- employee to act on their behalf for appraisals — review/approve goals, run the
-- mid-year, write evaluations, record discussions — while they're unavailable.
-- The delegate gets the same appraisal access as the manager (RLS + actions).
-- =============================================================================

alter table public.profiles
  add column if not exists appraisal_delegate_id uuid references public.profiles (id) on delete set null;

-- True when auth.uid() is p_manager, or the delegate p_manager has nominated.
create or replace function public.is_appraisal_manager(p_manager uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_manager is not null
     and (p_manager = auth.uid()
          or exists (
            select 1 from public.profiles m
            where m.id = p_manager and m.appraisal_delegate_id = auth.uid()
          ));
$$;
revoke execute on function public.is_appraisal_manager(uuid) from anon;

-- Appraisals: include the manager's delegate alongside the manager.
drop policy if exists "ap_select" on public.appraisals;
create policy "ap_select" on public.appraisals for select to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id()
             and (employee_id = auth.uid() or public.is_appraisal_manager(manager_id)
                  or public.is_hr() or public.is_tenant_admin())));

drop policy if exists "ap_update" on public.appraisals;
create policy "ap_update" on public.appraisals for update to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id()
             and (employee_id = auth.uid() or public.is_appraisal_manager(manager_id)
                  or public.is_hr() or public.is_tenant_admin())))
  with check (tenant_id = public.current_tenant_id());

-- Child-table access (goals, key results, events, competencies, appeals…) flows
-- through these two helpers — extend both to recognise the delegate.
create or replace function public.appraisal_participant(p_appraisal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.appraisals a
    where a.id = p_appraisal
      and (public.is_super_admin()
           or (a.tenant_id = public.current_tenant_id()
               and (a.employee_id = auth.uid() or public.is_appraisal_manager(a.manager_id)
                    or public.is_hr() or public.is_tenant_admin())))
  );
$$;
revoke execute on function public.appraisal_participant(uuid) from anon;

create or replace function public.appraisal_evaluator(p_appraisal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.appraisals a
    where a.id = p_appraisal
      and (public.is_super_admin()
           or (a.tenant_id = public.current_tenant_id()
               and (public.is_appraisal_manager(a.manager_id) or a.second_level_id = auth.uid()
                    or public.is_hr() or public.is_tenant_admin())))
  );
$$;
revoke execute on function public.appraisal_evaluator(uuid) from anon;
