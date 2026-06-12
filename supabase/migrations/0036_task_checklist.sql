-- =============================================================================
-- Greeter/driver task checklist.
--
-- Each transport task carries an ordered checklist (seeded from a per-task-type
-- template, extendable by the dispatcher). The assigned driver ticks items off
-- in the field; dispatcher and requester watch progress live.
-- =============================================================================

create table if not exists public.transport_task_checklist (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.transport_requests(id) on delete cascade,
  label      text not null,
  sort_order integer not null default 0,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_transport_checklist_request
  on public.transport_task_checklist(request_id, sort_order);

alter table public.transport_task_checklist enable row level security;

-- Same audience as the follow-up trail: dispatcher (tenant admin), the
-- requester, and the assigned driver.
drop policy if exists "transport_checklist_select" on public.transport_task_checklist;
create policy "transport_checklist_select" on public.transport_task_checklist for select to authenticated
  using (
    (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
    or exists (select 1 from public.transport_requests r
               where r.id = request_id and r.requester_id = auth.uid())
    or public.is_assigned_driver(request_id)
  );

-- Items are seeded when the task is created (by the requester or dispatcher);
-- the dispatcher can add extra ones later.
drop policy if exists "transport_checklist_insert" on public.transport_task_checklist;
create policy "transport_checklist_insert" on public.transport_task_checklist for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.is_tenant_admin()
      or exists (select 1 from public.transport_requests r
                 where r.id = request_id and r.requester_id = auth.uid())
    )
  );

-- Ticking off: the assigned driver or the dispatcher.
drop policy if exists "transport_checklist_update" on public.transport_task_checklist;
create policy "transport_checklist_update" on public.transport_task_checklist for update to authenticated
  using (
    (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
    or public.is_assigned_driver(request_id)
  )
  with check (
    (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
    or public.is_assigned_driver(request_id)
  );

drop policy if exists "transport_checklist_delete" on public.transport_task_checklist;
create policy "transport_checklist_delete" on public.transport_task_checklist for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());
