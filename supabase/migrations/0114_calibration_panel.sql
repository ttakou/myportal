-- Panel calibration: three gates (provisional → panel → PGM final), HR-set panel
-- members who rate each staff, and per-group target distributions enforced as a
-- forced distribution.

-- Which calibration gate an appraisal is at.
alter table public.appraisals
  add column if not exists calibration_gate text not null default 'provisional';
alter table public.appraisals drop constraint if exists appraisals_gate_chk;
alter table public.appraisals add constraint appraisals_gate_chk
  check (calibration_gate in ('provisional','panel','pgm','final'));

-- Panel membership per calibration group (set by HR).
create table if not exists public.calibration_panel_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  group_id    uuid not null references public.calibration_groups(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (group_id, member_id)
);
create index if not exists calibration_panel_members_group_idx on public.calibration_panel_members (group_id);

-- One panel member's rating of one staff member, within a group.
create table if not exists public.calibration_panel_ratings (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  group_id     uuid not null references public.calibration_groups(id) on delete cascade,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  member_id    uuid not null references public.profiles(id) on delete cascade,
  band_label   text not null,
  comment      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (group_id, appraisal_id, member_id)
);
create index if not exists calibration_panel_ratings_group_idx on public.calibration_panel_ratings (group_id, appraisal_id);

alter table public.calibration_panel_members enable row level security;
alter table public.calibration_panel_ratings enable row level security;

-- Panel membership: HR/admins manage and read.
drop policy if exists "calibration_panel_members_rw" on public.calibration_panel_members;
create policy "calibration_panel_members_rw" on public.calibration_panel_members for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))));

-- Ratings: HR sees all; a panel member sees/edits their own rows.
drop policy if exists "calibration_panel_ratings_select" on public.calibration_panel_ratings;
create policy "calibration_panel_ratings_select" on public.calibration_panel_ratings for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_hr()) or (select public.is_tenant_admin()) or member_id = (select auth.uid())))
  );

drop policy if exists "calibration_panel_ratings_write" on public.calibration_panel_ratings;
create policy "calibration_panel_ratings_write" on public.calibration_panel_ratings for all to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_hr()) or (select public.is_tenant_admin()) or member_id = (select auth.uid())))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_hr()) or (select public.is_tenant_admin()) or member_id = (select auth.uid())))
  );
