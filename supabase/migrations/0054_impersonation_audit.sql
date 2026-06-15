create table if not exists public.impersonation_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('start','stop')),
  created_at timestamptz not null default now()
);
alter table public.impersonation_audit enable row level security;

drop policy if exists "impersonation_audit_select" on public.impersonation_audit;
create policy "impersonation_audit_select" on public.impersonation_audit for select to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
