-- =============================================================================
-- Long-stay visitor passes.
--
-- Until now a visitor row was a single-day event: one `visit_date`, one arrival
-- and one departure. Contractors, auditors and secondees often stay for a week
-- or more and pass the gate every day. To support that we let a pre-registration
-- carry a date *range* (`visit_until`) and log every entry/exit as its own row in
-- `visitor_checkins`, so a pass can be checked in and out repeatedly across the
-- period while remaining a single visitor record.
--
--   • `visit_until IS NULL`  → classic single-day visit (unchanged behaviour).
--   • `visit_until` set       → a pass valid for [visit_date, visit_until]; each
--                               entry is a `visitor_checkins` event. The visitor
--                               is "on site" while an event is open (no check_out).
-- =============================================================================

-- 1. Range end on the visitor "pass". Null keeps the classic single-day record.
alter table public.visitors
  add column if not exists visit_until date;

alter table public.visitors drop constraint if exists visitors_visit_range_chk;
alter table public.visitors add constraint visitors_visit_range_chk
  check (visit_until is null or visit_until >= visit_date);

comment on column public.visitors.visit_until is
  'End date of a multi-day visitor pass (inclusive). NULL = single-day visit on visit_date.';

-- 2. Per-entry event log. One row per check-in; check_out_at is stamped on exit.
create table if not exists public.visitor_checkins (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  visitor_id    uuid not null references public.visitors (id) on delete cascade,
  check_in_at   timestamptz not null default now(),
  check_out_at  timestamptz,
  badge_no      text,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_visitor_checkins_visitor on public.visitor_checkins (visitor_id);
create index if not exists idx_visitor_checkins_open
  on public.visitor_checkins (tenant_id) where check_out_at is null;

alter table public.visitor_checkins enable row level security;

-- Access mirrors the parent visitor: host / creator, tenant admins, super admins
-- and `visitors:operate` holders (reception / security) may read and write the
-- entry log for any visitor they can already see.
drop policy if exists "visitor_checkins_access" on public.visitor_checkins;
create policy "visitor_checkins_access" on public.visitor_checkins for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.visitors v
      where v.id = visitor_id
        and (
          v.host_id = auth.uid()
          or v.created_by = auth.uid()
          or (
            v.tenant_id = public.current_tenant_id()
            and (public.is_tenant_admin() or public.has_module_permission('visitors', 'operate'))
          )
        )
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.visitors v
      where v.id = visitor_id
        and (
          v.host_id = auth.uid()
          or v.created_by = auth.uid()
          or (
            v.tenant_id = public.current_tenant_id()
            and (public.is_tenant_admin() or public.has_module_permission('visitors', 'operate'))
          )
        )
    )
  );

-- Realtime so the live emergency muster reflects gate entries/exits instantly.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visitor_checkins'
  ) then
    alter publication supabase_realtime add table public.visitor_checkins;
  end if;
end$$;
