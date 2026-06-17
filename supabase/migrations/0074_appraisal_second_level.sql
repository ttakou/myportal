-- 0074: Optional second-level approval gate (manager's-manager / dept head).

alter table public.appraisal_cycles
  add column if not exists require_second_level boolean not null default false;

alter table public.appraisals
  add column if not exists second_level_id uuid references public.profiles(id);
create index if not exists appraisals_second_level_idx on public.appraisals(second_level_id);

-- Extend visibility to the assigned second-level approver.
drop policy if exists "ap_select" on public.appraisals;
create policy "ap_select" on public.appraisals for select to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id()
             and (employee_id = auth.uid() or manager_id = auth.uid()
                  or second_level_id = auth.uid()
                  or public.is_hr() or public.is_tenant_admin())));

drop policy if exists "ap_update" on public.appraisals;
create policy "ap_update" on public.appraisals for update to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id()
             and (employee_id = auth.uid() or manager_id = auth.uid()
                  or second_level_id = auth.uid()
                  or public.is_hr() or public.is_tenant_admin())))
  with check (tenant_id = public.current_tenant_id());

-- Child-table access (goals/competencies/KRs/events/appeals) follows this too.
create or replace function public.appraisal_participant(p_appraisal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.appraisals a
    where a.id = p_appraisal
      and (public.is_super_admin()
           or (a.tenant_id = public.current_tenant_id()
               and (a.employee_id = auth.uid() or a.manager_id = auth.uid()
                    or a.second_level_id = auth.uid()
                    or public.is_hr() or public.is_tenant_admin())))
  );
$$;
