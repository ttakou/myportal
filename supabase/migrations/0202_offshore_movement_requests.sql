-- Movement change requests: early / late mobilisation or demobilisation.
--
-- A staff member (for themselves), their line manager, or the offshore desk
-- asks to move one date of one hitch. A request a staff member raises for
-- themselves goes to their line manager first when they have one; the OIM
-- decides. Approved changes move that hitch only: the rotation itself, and so
-- every later crew change, stays on schedule.
--
-- Every state change goes through server actions (the service role), which
-- check who may act; RLS here only governs who can read and raise.

create table if not exists public.offshore_movement_requests (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  crew_id          uuid references public.offshore_crews(id) on delete set null,
  installation_id  uuid references public.offshore_installations(id) on delete set null,
  kind             text not null check (kind in ('early_mob','late_mob','early_demob','late_demob')),
  scheduled_date   date not null,
  requested_date   date not null,
  reason           text not null check (reason in ('medical','compassionate','operational','training_logistics','other')),
  note             text,
  cover_note       text,
  status           text not null default 'pending'
                   check (status in ('pending_endorsement','pending','approved','rejected','withdrawn')),
  requested_by     uuid references public.profiles(id) on delete set null,
  endorsed_by      uuid references public.profiles(id) on delete set null,
  endorsed_at      timestamptz,
  endorse_comment  text,
  decided_by       uuid references public.profiles(id) on delete set null,
  decided_at       timestamptz,
  decision_comment text,
  applied_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (requested_date <> scheduled_date)
);

create index if not exists idx_offshore_moves_tenant_status on public.offshore_movement_requests (tenant_id, status);
create index if not exists idx_offshore_moves_profile on public.offshore_movement_requests (profile_id);
create index if not exists idx_offshore_moves_requested_by on public.offshore_movement_requests (requested_by);
create index if not exists idx_offshore_moves_decided on public.offshore_movement_requests (tenant_id, decided_at);

drop trigger if exists trg_offshore_moves_updated_at on public.offshore_movement_requests;
create trigger trg_offshore_moves_updated_at before update on public.offshore_movement_requests
  for each row execute function public.set_updated_at();

alter table public.offshore_movement_requests enable row level security;

-- Read: the person, whoever raised it, anyone above them in the reporting
-- line, and the offshore desk.
drop policy if exists "offshore_moves_select" on public.offshore_movement_requests;
create policy "offshore_moves_select" on public.offshore_movement_requests for select to authenticated
  using (
    public.is_super_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        profile_id = (select auth.uid())
        or requested_by = (select auth.uid())
        or public.is_in_my_line(profile_id)
        or public.is_offshore_dispatcher()
      )
    )
  );

-- Late departure joins the attendance flags, so an approved extension is on
-- the record like an early departure is.
alter table public.offshore_rotation_flags drop constraint if exists offshore_rotation_flags_kind_check;
alter table public.offshore_rotation_flags
  add constraint offshore_rotation_flags_kind_check
  check (kind in ('absent','early_arrival','early_departure','late_arrival','late_departure'));
