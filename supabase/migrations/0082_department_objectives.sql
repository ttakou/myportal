-- 0082: Department objectives (HR-populated) + one witness per objective.
--
-- HR maintains a library of department (or company-wide) objectives. When an
-- employee sets a goal, they can align it to one of these instead of free text.
-- Also: a goal may have at most one witness/assessor.

create table public.appraisal_department_objectives (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  department  text,                       -- null = applies to the whole company
  title       text not null,
  description text,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index on public.appraisal_department_objectives(tenant_id, department);

alter table public.appraisal_department_objectives enable row level security;

-- Everyone in the tenant can read them (employees pick from them); HR/admins manage.
create policy "ado_select" on public.appraisal_department_objectives for select to authenticated
  using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "ado_manage" on public.appraisal_department_objectives for all to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())))
  with check (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())));

-- At most one witness/assessor per objective.
create unique index appraisal_goal_raters_one_per_goal
  on public.appraisal_goal_raters(goal_id);
