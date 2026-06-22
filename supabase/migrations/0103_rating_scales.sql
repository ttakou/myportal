-- Configurable rating scales (Performance reshape, §6).
-- HR can define multiple named scales (5-point, 4-point, competency, …); cycles
-- and form sections will reference one. Each scale owns its levels + display
-- rules. One default per (tenant, kind).

create table if not exists public.rating_scales (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  name                      text not null,
  description               text,
  kind                      text not null default 'performance',  -- performance | competency | generic
  -- [{ value:number, label:text, description?:text, color?:text }]
  levels                    jsonb not null default '[]'::jsonb,
  allow_decimals            boolean not null default false,
  comment_required          boolean not null default false,
  evidence_required         boolean not null default false,
  show_numeric_to_employee  boolean not null default true,
  is_default                boolean not null default false,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint rating_scales_kind_chk check (kind in ('performance', 'competency', 'generic'))
);

create index if not exists rating_scales_tenant_idx on public.rating_scales (tenant_id);
-- At most one default scale per kind within a tenant.
create unique index if not exists rating_scales_one_default
  on public.rating_scales (tenant_id, kind) where is_default;

alter table public.rating_scales enable row level security;

drop policy if exists "rating_scales_select" on public.rating_scales;
create policy "rating_scales_select" on public.rating_scales for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()))
  );

drop policy if exists "rating_scales_manage" on public.rating_scales;
create policy "rating_scales_manage" on public.rating_scales for all to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_hr()) or (select public.is_tenant_admin())))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_hr()) or (select public.is_tenant_admin())))
  );

-- Seed a default 5-point performance scale for every tenant that has none.
insert into public.rating_scales (tenant_id, name, kind, is_default, levels)
  select t.id, 'Standard 5-point', 'performance', true,
    '[{"value":5,"label":"Outstanding","color":"#15803d"},
      {"value":4,"label":"Exceeds expectations","color":"#65a30d"},
      {"value":3,"label":"Meets expectations","color":"#0891b2"},
      {"value":2,"label":"Needs improvement","color":"#d97706"},
      {"value":1,"label":"Unsatisfactory","color":"#dc2626"}]'::jsonb
  from public.tenants t
  where not exists (
    select 1 from public.rating_scales rs
    where rs.tenant_id = t.id and rs.kind = 'performance' and rs.is_default
  );
