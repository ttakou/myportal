-- Configurable permission matrix for the Performance module.
-- One row per tenant holds a { role: { capability: bool } } matrix governing
-- cross-cutting capabilities and sensitive-field visibility (scores, comments,
-- ratings, reopen, calibration, exports, salary/promotion/succession). Defaults
-- live in app code (DEFAULT_PERMISSION_MATRIX); a missing row means "defaults".
create table if not exists public.performance_permission_settings (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  matrix      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.performance_permission_settings enable row level security;

-- Every authenticated tenant member may READ the matrix — enforcement runs as
-- the signed-in user and needs to resolve their own capabilities. Only HR /
-- admins (or super admins) may change it.
drop policy if exists "perf_perm_settings_select" on public.performance_permission_settings;
create policy "perf_perm_settings_select" on public.performance_permission_settings for select to authenticated
  using ((select public.is_super_admin()) or tenant_id = (select public.current_tenant_id()));

drop policy if exists "perf_perm_settings_write" on public.performance_permission_settings;
create policy "perf_perm_settings_write" on public.performance_permission_settings for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))));
