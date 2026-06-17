-- 0076: Per-goal stakeholder reviewers (confidential upward feedback).
--
-- An employee can attach a business colleague to one of their objectives; that
-- reviewer rates the employee's performance on that goal. The rating and the
-- comment are visible ONLY to the line manager, the second-level approver, HR
-- and admins — never to the employee being appraised.

create table public.appraisal_goal_raters (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  goal_id      uuid not null references public.appraisal_goals(id) on delete cascade,
  rater_id     uuid not null references public.profiles(id) on delete cascade,
  rating       int check (rating between 1 and 5),
  comment      text,
  status       text not null default 'invited' check (status in ('invited','submitted')),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  unique (goal_id, rater_id)
);
create index on public.appraisal_goal_raters(appraisal_id);
create index on public.appraisal_goal_raters(rater_id);

alter table public.appraisal_goal_raters enable row level security;

-- Evaluators (manager / second-level / HR / admins) — deliberately NOT the
-- employee — can see and manage reviewers, including ratings and comments.
create or replace function public.appraisal_evaluator(p_appraisal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.appraisals a
    where a.id = p_appraisal
      and (public.is_super_admin()
           or (a.tenant_id = public.current_tenant_id()
               and (a.manager_id = auth.uid() or a.second_level_id = auth.uid()
                    or public.is_hr() or public.is_tenant_admin())))
  );
$$;
revoke execute on function public.appraisal_evaluator(uuid) from anon;

create policy "agr_evaluator_all" on public.appraisal_goal_raters for all to authenticated
  using (public.appraisal_evaluator(appraisal_id))
  with check (tenant_id = public.current_tenant_id() and public.appraisal_evaluator(appraisal_id));

-- The reviewer can read and update only their own assignment.
create policy "agr_rater_select" on public.appraisal_goal_raters for select to authenticated
  using (rater_id = auth.uid());
create policy "agr_rater_update" on public.appraisal_goal_raters for update to authenticated
  using (rater_id = auth.uid())
  with check (rater_id = auth.uid() and tenant_id = public.current_tenant_id());

-- The employee can attach / detach reviewers on their own appraisal, but has NO
-- select policy here, so they can never read the rating or comment columns.
create policy "agr_employee_insert" on public.appraisal_goal_raters for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    and exists (select 1 from public.appraisals a
                where a.id = appraisal_id and a.employee_id = auth.uid()
                  and a.tenant_id = public.current_tenant_id())
  );
create policy "agr_employee_delete" on public.appraisal_goal_raters for delete to authenticated
  using (
    exists (select 1 from public.appraisals a
            where a.id = appraisal_id and a.employee_id = auth.uid()
              and a.tenant_id = public.current_tenant_id())
  );

-- Employee-facing read: who is attached and whether they have responded.
-- Deliberately omits rating and comment (confidential to the manager).
create or replace function public.goal_raters_for_employee(p_appraisal uuid)
returns table (id uuid, goal_id uuid, rater_id uuid, rater_name text, status text)
language sql stable security definer set search_path = public as $$
  select r.id, r.goal_id, r.rater_id, p.full_name, r.status
  from public.appraisal_goal_raters r
  join public.appraisals a on a.id = r.appraisal_id
  join public.profiles   p on p.id = r.rater_id
  where r.appraisal_id = p_appraisal
    and a.employee_id = auth.uid()
    and a.tenant_id = public.current_tenant_id();
$$;
revoke execute on function public.goal_raters_for_employee(uuid) from anon;

-- Reviewer-facing read: the goals this user has been asked to rate, with just
-- enough context (employee, goal, cycle) to give feedback.
create or replace function public.my_goal_rater_assignments()
returns table (
  id uuid, appraisal_id uuid, goal_id uuid, goal_title text,
  employee_name text, cycle_name text, rating int, comment text, status text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.appraisal_id, r.goal_id, g.title, e.full_name, c.name,
         r.rating, r.comment, r.status
  from public.appraisal_goal_raters r
  join public.appraisal_goals  g on g.id = r.goal_id
  join public.appraisals       a on a.id = r.appraisal_id
  join public.profiles         e on e.id = a.employee_id
  join public.appraisal_cycles c on c.id = a.cycle_id
  where r.rater_id = auth.uid()
    and r.tenant_id = public.current_tenant_id()
  order by c.name desc, e.full_name, g.title;
$$;
revoke execute on function public.my_goal_rater_assignments() from anon;
