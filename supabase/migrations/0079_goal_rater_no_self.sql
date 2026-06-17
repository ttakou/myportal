-- 0079: Defense-in-depth — an employee cannot attach themselves as a reviewer
-- on their own appraisal. Enforces the no-self-review rule at the DB layer
-- (the server action already blocks it) and closes a path to self-granting the
-- auto Witness role via a direct API insert.

drop policy if exists "agr_employee_insert" on public.appraisal_goal_raters;
create policy "agr_employee_insert" on public.appraisal_goal_raters for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    and rater_id <> auth.uid()
    and exists (select 1 from public.appraisals a
                where a.id = appraisal_id and a.employee_id = auth.uid()
                  and a.tenant_id = public.current_tenant_id())
  );
