-- Canteen feedback & incidents
do $$
begin
  if not exists (select 1 from pg_type where typname='canteen_issue_type') then
    create type public.canteen_issue_type as enum ('none','hygiene','late_service','wrong_meal','allergy','suggestion');
  end if;
  if not exists (select 1 from pg_type where typname='feedback_status') then
    create type public.feedback_status as enum ('open','resolved');
  end if;
end$$;

create table if not exists public.canteen_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  booking_id uuid references public.canteen_bookings(id) on delete set null,
  service_date date not null default current_date,
  food_quality integer check (food_quality between 1 and 5),
  quantity_rating integer check (quantity_rating between 1 and 5),
  issue_type public.canteen_issue_type not null default 'none',
  comment text,
  status public.feedback_status not null default 'open',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_canteen_feedback_tenant on public.canteen_feedback(tenant_id, created_at desc);

alter table public.canteen_feedback enable row level security;
drop policy if exists "feedback_select_own" on public.canteen_feedback;
create policy "feedback_select_own" on public.canteen_feedback for select to authenticated using (profile_id = auth.uid());
drop policy if exists "feedback_select_admin" on public.canteen_feedback;
create policy "feedback_select_admin" on public.canteen_feedback for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());
drop policy if exists "feedback_insert" on public.canteen_feedback;
create policy "feedback_insert" on public.canteen_feedback for insert to authenticated
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "feedback_admin_write" on public.canteen_feedback;
create policy "feedback_admin_write" on public.canteen_feedback for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
