-- =============================================================================
-- EESS — incident evolution timeline
--
-- Adds an append-only audit trail for each SOS / incident so:
--   * the reporter can post follow-up updates to their OWN incident while it is
--     not yet resolved (extra detail, a refreshed location), and
--   * everyone with visibility (the reporter, and safety admins) can track how
--     the incident evolved — creation, reporter updates and status changes.
--
-- A SECURITY DEFINER trigger logs the incident's own lifecycle (created + every
-- status change) automatically, so the trail is complete regardless of which
-- code path moved the incident.
-- =============================================================================

create table if not exists public.eess_incident_updates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  incident_id uuid not null references public.eess_incidents(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  kind        text not null default 'note'
                check (kind in ('created','note','location','status')),
  body        text,
  status      public.eess_incident_status,        -- set when kind = 'status'
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);
create index if not exists idx_eess_incident_updates
  on public.eess_incident_updates(incident_id, created_at);

-- Fill tenant_id from the actor's profile on insert (mirrors eess_fill_tenant).
drop trigger if exists trg_eess_incident_updates_tenant on public.eess_incident_updates;
create trigger trg_eess_incident_updates_tenant
  before insert on public.eess_incident_updates
  for each row execute function public.eess_fill_tenant();

-- --- Lifecycle logger -------------------------------------------------------
-- Records 'created' on insert and a 'status' entry whenever the status moves.
-- SECURITY DEFINER so it can write the trail irrespective of the writer's RLS.
create or replace function public.eess_log_incident_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.eess_incident_updates(tenant_id, incident_id, author_id, kind, status, body)
    values (new.tenant_id, new.id, new.reporter_id, 'created', new.status, new.note);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.eess_incident_updates(tenant_id, incident_id, author_id, kind, status)
    values (new.tenant_id, new.id, auth.uid(), 'status', new.status);
  end if;
  return new;
end; $$;

drop trigger if exists trg_eess_incidents_log on public.eess_incidents;
create trigger trg_eess_incidents_log
  after insert or update of status on public.eess_incidents
  for each row execute function public.eess_log_incident_change();

-- Trigger function only — never meant to be invoked directly over the API.
revoke all on function public.eess_log_incident_change() from public, anon, authenticated;

-- --- RLS --------------------------------------------------------------------
alter table public.eess_incident_updates enable row level security;

-- Read: the reporter of the parent incident, or a safety admin in the tenant.
drop policy if exists "eess_incident_updates_select" on public.eess_incident_updates;
create policy "eess_incident_updates_select" on public.eess_incident_updates
  for select to authenticated
  using (
    exists (
      select 1 from public.eess_incidents i
      where i.id = incident_id
        and (
          i.reporter_id = auth.uid()
          or (i.tenant_id = public.current_tenant_id() and public.is_safety_admin())
        )
    )
  );

-- Write: the reporter may post to their OWN, not-yet-resolved incident; safety
-- admins may post to any incident in their tenant. author_id must be the actor.
drop policy if exists "eess_incident_updates_insert" on public.eess_incident_updates;
create policy "eess_incident_updates_insert" on public.eess_incident_updates
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.eess_incidents i
      where i.id = incident_id
        and (
          (i.reporter_id = auth.uid() and i.status <> 'resolved')
          or (i.tenant_id = public.current_tenant_id() and public.is_safety_admin())
        )
    )
  );

-- --- Backfill ---------------------------------------------------------------
-- Seed a 'created' entry (and acknowledged/resolved milestones, where known) for
-- incidents that predate the timeline, so their history is not blank. Guarded so
-- it is safe to re-run.
insert into public.eess_incident_updates(tenant_id, incident_id, author_id, kind, status, body, created_at)
select i.tenant_id, i.id, i.reporter_id, 'created', 'open'::public.eess_incident_status, i.note, i.created_at
from public.eess_incidents i
where not exists (
  select 1 from public.eess_incident_updates u
  where u.incident_id = i.id and u.kind = 'created'
);

insert into public.eess_incident_updates(tenant_id, incident_id, author_id, kind, status, created_at)
select i.tenant_id, i.id, i.acknowledged_by, 'status',
       case when i.status = 'responding' then 'responding' else 'acknowledged' end::public.eess_incident_status,
       i.acknowledged_at
from public.eess_incidents i
where i.acknowledged_at is not null
  and not exists (
    select 1 from public.eess_incident_updates u
    where u.incident_id = i.id and u.kind = 'status'
      and u.status in ('acknowledged','responding')
  );

insert into public.eess_incident_updates(tenant_id, incident_id, author_id, kind, status, created_at)
select i.tenant_id, i.id, i.resolved_by, 'status', 'resolved'::public.eess_incident_status, i.resolved_at
from public.eess_incidents i
where i.resolved_at is not null
  and not exists (
    select 1 from public.eess_incident_updates u
    where u.incident_id = i.id and u.kind = 'status' and u.status = 'resolved'
  );
