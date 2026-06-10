-- =============================================================================
-- Sprint 4: Visitor Management
-- Pre-registration, reception check-in/out, and a live emergency muster list.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'visitor_status') then
    create type public.visitor_status as enum
      ('pre_registered','checked_in','checked_out','cancelled');
  end if;
end$$;

create table if not exists public.visitors (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  host_id       uuid default auth.uid() references public.profiles (id) on delete set null,
  full_name     text not null,
  company       text,
  purpose       text,
  visit_date    date not null default current_date,
  status        public.visitor_status not null default 'pre_registered',
  badge_no      text,
  check_in_at   timestamptz,
  check_out_at  timestamptz,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_visitors_date on public.visitors (tenant_id, visit_date);
create index if not exists idx_visitors_status on public.visitors (tenant_id, status);

drop trigger if exists trg_visitors_updated_at on public.visitors;
create trigger trg_visitors_updated_at
  before update on public.visitors
  for each row execute function public.set_updated_at();

alter table public.visitors enable row level security;

-- Hosts see/manage their own visitors; admins (reception/HSE) see/manage all.
drop policy if exists "visitors_select_host" on public.visitors;
create policy "visitors_select_host" on public.visitors for select to authenticated
  using (host_id = auth.uid() or created_by = auth.uid());
drop policy if exists "visitors_select_admin" on public.visitors;
create policy "visitors_select_admin" on public.visitors for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

drop policy if exists "visitors_insert" on public.visitors;
create policy "visitors_insert" on public.visitors for insert to authenticated
  with check (tenant_id = public.current_tenant_id()
              and (host_id = auth.uid() or public.is_tenant_admin()));

drop policy if exists "visitors_update_host" on public.visitors;
create policy "visitors_update_host" on public.visitors for update to authenticated
  using (host_id = auth.uid() or created_by = auth.uid())
  with check (host_id = auth.uid() or created_by = auth.uid());
drop policy if exists "visitors_admin_write" on public.visitors;
create policy "visitors_admin_write" on public.visitors for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

-- Realtime for the live muster list.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visitors'
  ) then
    alter publication supabase_realtime add table public.visitors;
  end if;
end$$;
