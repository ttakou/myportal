-- A member's savings goal: a target amount by a target date. One per member.
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_id)
);

alter table public.savings_goals enable row level security;

drop policy if exists "savings_goal_own" on public.savings_goals;
create policy "savings_goal_own" on public.savings_goals for all to authenticated
  using (profile_id = auth.uid() and tenant_id = public.current_tenant_id())
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());

drop policy if exists "savings_goal_admin_read" on public.savings_goals;
create policy "savings_goal_admin_read" on public.savings_goals for select to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
