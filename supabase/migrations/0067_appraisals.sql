-- 0067: Performance appraisal workflow — Phase 1 spine
-- Cycles, per-employee appraisals with a stage/status engine, goals with full
-- change history, and an append-only audit/event log. RLS scopes everything to
-- the tenant; rows are visible to the employee, their line manager, HR and
-- tenant admins. Fine-grained stage transitions are enforced in server actions.

-- ---------------------------------------------------------------------------
create table public.appraisal_cycles (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  name                  text not null,
  year                  int not null,
  period_start          date not null,
  period_end            date not null,
  goal_setting_deadline date,
  status                text not null default 'draft' check (status in ('draft','active','closed')),
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on public.appraisal_cycles(tenant_id);

create table public.appraisals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  cycle_id      uuid not null references public.appraisal_cycles(id) on delete cascade,
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  manager_id    uuid references public.profiles(id),
  stage         text not null default 'goal_setting'
                check (stage in ('goal_setting','goal_review','self_assessment',
                                 'manager_review','hr_review','final_discussion',
                                 'acknowledgement','closed')),
  status        text not null default 'not_started'
                check (status in ('not_started','draft','pending_employee_submission',
                                  'pending_manager_review','returned_for_correction',
                                  'pending_hr_review','pending_second_level',
                                  'ready_for_final_discussion','pending_employee_acknowledgement',
                                  'under_appeal','completed','closed','overdue')),
  overall_rating numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (cycle_id, employee_id)
);
create index on public.appraisals(tenant_id);
create index on public.appraisals(employee_id);
create index on public.appraisals(manager_id);
create index on public.appraisals(cycle_id);

create table public.appraisal_goals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  appraisal_id      uuid not null references public.appraisals(id) on delete cascade,
  title             text not null,
  description       text,
  weight            numeric not null default 0,
  deadline          date,
  success_indicator text,
  employee_progress text,
  status            text not null default 'draft' check (status in ('draft','approved')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.appraisal_goals(appraisal_id);

create table public.appraisal_goal_history (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  goal_id      uuid references public.appraisal_goals(id) on delete set null,
  changed_by   uuid references public.profiles(id),
  change_note  text,
  snapshot     jsonb,
  created_at   timestamptz not null default now()
);
create index on public.appraisal_goal_history(appraisal_id);

create table public.appraisal_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  actor_id     uuid references public.profiles(id),
  stage        text,
  action       text not null,
  comment      text,
  created_at   timestamptz not null default now()
);
create index on public.appraisal_events(appraisal_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.appraisal_cycles      enable row level security;
alter table public.appraisals            enable row level security;
alter table public.appraisal_goals       enable row level security;
alter table public.appraisal_goal_history enable row level security;
alter table public.appraisal_events      enable row level security;

-- Cycles: everyone in the tenant can see them; HR/admins manage.
create policy "ac_select" on public.appraisal_cycles for select to authenticated
  using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "ac_manage" on public.appraisal_cycles for all to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())))
  with check (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())));

-- Appraisals: visible to the employee, their manager, HR and admins.
create policy "ap_select" on public.appraisals for select to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id()
             and (employee_id = auth.uid() or manager_id = auth.uid()
                  or public.is_hr() or public.is_tenant_admin())));
create policy "ap_insert" on public.appraisals for insert to authenticated
  with check (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())));
create policy "ap_update" on public.appraisals for update to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id()
             and (employee_id = auth.uid() or manager_id = auth.uid()
                  or public.is_hr() or public.is_tenant_admin())))
  with check (tenant_id = public.current_tenant_id());
create policy "ap_delete" on public.appraisals for delete to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_tenant_admin())));

-- Child tables: access follows the parent appraisal.
create or replace function public.appraisal_participant(p_appraisal uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.appraisals a
    where a.id = p_appraisal
      and (public.is_super_admin()
           or (a.tenant_id = public.current_tenant_id()
               and (a.employee_id = auth.uid() or a.manager_id = auth.uid()
                    or public.is_hr() or public.is_tenant_admin())))
  );
$$;
revoke execute on function public.appraisal_participant(uuid) from anon;

create policy "ag_all" on public.appraisal_goals for all to authenticated
  using (public.appraisal_participant(appraisal_id))
  with check (tenant_id = public.current_tenant_id() and public.appraisal_participant(appraisal_id));

create policy "agh_select" on public.appraisal_goal_history for select to authenticated
  using (public.appraisal_participant(appraisal_id));
create policy "agh_insert" on public.appraisal_goal_history for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.appraisal_participant(appraisal_id));

create policy "ae_select" on public.appraisal_events for select to authenticated
  using (public.appraisal_participant(appraisal_id));
create policy "ae_insert" on public.appraisal_events for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.appraisal_participant(appraisal_id));
