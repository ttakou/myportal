-- =============================================================================
-- Transport dispatch upgrade
--   * transport_drivers.profile_id — links a driver to a portal account so the
--     driver can see and update their own tasks
--   * task fields on transport_requests: task type, priority, dispatcher notes
--   * transport_task_updates — follow-up trail (notes + status changes)
--   * RLS so an assigned driver can read and update their tasks
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname='transport_task_type') then
    create type public.transport_task_type as enum
      ('passenger','airport_pickup','airport_dropoff','delivery','errand','other');
  end if;
  if not exists (select 1 from pg_type where typname='transport_priority') then
    create type public.transport_priority as enum ('normal','high','urgent');
  end if;
end$$;

alter table public.transport_drivers
  add column if not exists profile_id uuid unique references public.profiles(id) on delete set null;

alter table public.transport_requests
  add column if not exists task_type public.transport_task_type not null default 'passenger',
  add column if not exists priority  public.transport_priority  not null default 'normal',
  add column if not exists notes     text;

-- Follow-up trail: free-text notes, optionally tied to a status change.
create table if not exists public.transport_task_updates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.transport_requests(id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  note       text,
  new_status public.transport_request_status,
  created_at timestamptz not null default now()
);
create index if not exists idx_transport_updates_request
  on public.transport_task_updates(request_id, created_at);

alter table public.transport_task_updates enable row level security;

-- Whether the signed-in user is the driver assigned to the request.
create or replace function public.is_assigned_driver(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.transport_requests r
    join public.transport_drivers d on d.id = r.driver_id
    where r.id = p_request and d.profile_id = auth.uid()
  );
$$;
revoke execute on function public.is_assigned_driver(uuid) from public, anon;
grant execute on function public.is_assigned_driver(uuid) to authenticated;

-- Drivers see and update the requests assigned to them.
drop policy if exists "transport_requests_select_driver" on public.transport_requests;
create policy "transport_requests_select_driver" on public.transport_requests for select to authenticated
  using (exists (select 1 from public.transport_drivers d
                 where d.id = driver_id and d.profile_id = auth.uid()));
drop policy if exists "transport_requests_update_driver" on public.transport_requests;
create policy "transport_requests_update_driver" on public.transport_requests for update to authenticated
  using (exists (select 1 from public.transport_drivers d
                 where d.id = driver_id and d.profile_id = auth.uid()))
  with check (exists (select 1 from public.transport_drivers d
                      where d.id = driver_id and d.profile_id = auth.uid()));

-- Follow-ups: visible to admins, the requester, and the assigned driver;
-- the same people may add one, always as themselves.
drop policy if exists "transport_updates_select" on public.transport_task_updates;
create policy "transport_updates_select" on public.transport_task_updates for select to authenticated
  using (
    (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
    or exists (select 1 from public.transport_requests r
               where r.id = request_id and r.requester_id = auth.uid())
    or public.is_assigned_driver(request_id)
  );
drop policy if exists "transport_updates_insert" on public.transport_task_updates;
create policy "transport_updates_insert" on public.transport_task_updates for insert to authenticated
  with check (
    author_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and (
      public.is_tenant_admin()
      or exists (select 1 from public.transport_requests r
                 where r.id = request_id and r.requester_id = auth.uid())
      or public.is_assigned_driver(request_id)
    )
  );
