-- Performance module: evaluate the row-level security helpers once per query,
-- not once per row.
--
-- Every read of goals, events, ratings, plans and key results calls
-- appraisal_participant() for each row, and that function in turn called
-- auth.uid(), is_super_admin(), current_tenant_id(), is_hr() and
-- is_tenant_admin() bare. Bare, Postgres re-evaluates them per row; wrapped in
-- a scalar subquery it evaluates each once as an InitPlan and reuses the value.
-- The appraisals table's own select/update policies had the same shape, as
-- did the PIP policies. pg_stat_statements put the main appraisal select at
-- 85–91 ms of server time on a few hundred rows; this is the largest share.
--
-- Semantics are unchanged: same predicates, same functions, same answers.

create or replace function private.uid_tenant_id()
returns uuid
language sql
stable security definer
set search_path to ''
as $$
  select tenant_id from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_appraisal_manager(p_manager uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select p_manager is not null
     and (p_manager = (select auth.uid())
          or exists (
            select 1 from public.profiles m
            where m.id = p_manager and m.appraisal_delegate_id = (select auth.uid())
          ));
$$;

create or replace function public.appraisal_participant(p_appraisal uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.appraisals a
    where a.id = p_appraisal
      and ((select public.is_super_admin())
           or (a.tenant_id = (select public.current_tenant_id())
               and (a.employee_id = (select auth.uid())
                    or public.is_appraisal_manager(a.manager_id)
                    or (select public.is_hr())
                    or (select public.is_tenant_admin()))))
  );
$$;

create or replace function public.appraisal_evaluator(p_appraisal uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.appraisals a
    where a.id = p_appraisal
      and ((select public.is_super_admin())
           or (a.tenant_id = (select public.current_tenant_id())
               and (public.is_appraisal_manager(a.manager_id)
                    or a.second_level_id = (select auth.uid())
                    or (select public.is_hr())
                    or (select public.is_tenant_admin()))))
  );
$$;

-- appraisals: the two policies that were still bare.
drop policy if exists ap_select on public.appraisals;
create policy ap_select on public.appraisals
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and (employee_id = (select auth.uid())
             or public.is_appraisal_manager(manager_id)
             or (select public.is_hr())
             or (select public.is_tenant_admin())))
  );

drop policy if exists ap_update on public.appraisals;
create policy ap_update on public.appraisals
  for update to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and (employee_id = (select auth.uid())
             or public.is_appraisal_manager(manager_id)
             or (select public.is_hr())
             or (select public.is_tenant_admin())))
  )
  with check (tenant_id = (select public.current_tenant_id()));

-- appraisal_pips: same shape, same fix.
drop policy if exists pip_select on public.appraisal_pips;
create policy pip_select on public.appraisal_pips
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and (profile_id = (select auth.uid())
             or public.is_appraisal_manager(manager_id)
             or (select public.is_hr())
             or (select public.is_tenant_admin())))
  );

drop policy if exists pip_write on public.appraisal_pips;
create policy pip_write on public.appraisal_pips
  for all to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and (public.is_appraisal_manager(manager_id)
             or (select public.is_hr())
             or (select public.is_tenant_admin())))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and (public.is_appraisal_manager(manager_id)
             or (select public.is_hr())
             or (select public.is_tenant_admin())))
  );
