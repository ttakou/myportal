-- Visitors: a directory of people who come back, a do-not-admit flag, and
-- the stamps the daily and live jobs lean on.
--
-- 1) visitor_directory: one row per person, matched on ID number, then
--    phone, then name + company. Pre-registration prefills from it and
--    every visit links to it, so reception sees "4th visit, last hosted
--    by X" instead of retyping.
-- 2) do_not_admit on that row: shown in red at pre-registration and
--    check-in, and refused by the actions.
-- 3) no_show status (applied separately first) for pre-registered visits
--    that never came, set by the daily job; overstay_alerted_at so the
--    live job tells security once per visit.

-- Applied separately first (a new enum value cannot be used in the same
-- transaction that adds it):
--   alter type public.visitor_status add value if not exists 'no_show';

create table if not exists public.visitor_directory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  company text,
  id_document_type text,
  id_document_number text,
  email text,
  phone text,
  do_not_admit boolean not null default false,
  do_not_admit_reason text,
  do_not_admit_by uuid references public.profiles(id) on delete set null,
  do_not_admit_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_visitor_directory_updated_at on public.visitor_directory;
create trigger trg_visitor_directory_updated_at before update on public.visitor_directory
  for each row execute function public.set_updated_at();

create index if not exists idx_visitor_directory_name on public.visitor_directory (tenant_id, lower(full_name));
create unique index if not exists visitor_directory_id_number
  on public.visitor_directory (tenant_id, lower(id_document_number))
  where id_document_number is not null and id_document_number <> '';
create index if not exists idx_visitor_directory_phone on public.visitor_directory (tenant_id, phone) where phone is not null;

alter table public.visitor_directory enable row level security;

-- Whoever registers or receives visitors reads the directory; admins too.
drop policy if exists visitor_directory_select on public.visitor_directory;
create policy visitor_directory_select on public.visitor_directory for select to authenticated
  using (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_tenant_admin())
        or public.has_module_permission('visitors', 'create')
        or public.has_module_permission('visitors', 'operate')
      )
    )
  );
drop policy if exists visitor_directory_write on public.visitor_directory;
create policy visitor_directory_write on public.visitor_directory for all to authenticated
  using (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_tenant_admin())
        or public.has_module_permission('visitors', 'create')
        or public.has_module_permission('visitors', 'operate')
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_tenant_admin())
        or public.has_module_permission('visitors', 'create')
        or public.has_module_permission('visitors', 'operate')
      )
    )
  );

alter table public.visitors
  add column if not exists directory_id uuid references public.visitor_directory(id) on delete set null,
  add column if not exists overstay_alerted_at timestamptz;
create index if not exists idx_visitors_directory on public.visitors (directory_id);

-- Backfill: one directory row per person already in the visitor log,
-- keyed on the ID number when there is one, else name + company. Two
-- statements: a data-modifying CTE cannot see rows another CTE in the
-- same statement inserted, so the link runs after the insert.
with keyed as (
  select
    v.tenant_id,
    coalesce(nullif(lower(trim(v.id_document_number)), ''), lower(trim(v.full_name)) || '|' || coalesce(lower(trim(v.company)), '')) as k,
    v.full_name, v.company, v.id_document_type, v.id_document_number, v.email, v.phone, v.visit_date
  from public.visitors v
  where v.directory_id is null
),
latest as (
  select distinct on (tenant_id, k) tenant_id, k, full_name, company, id_document_type,
         nullif(trim(id_document_number), '') as id_document_number, email, phone
  from keyed
  order by tenant_id, k, visit_date desc
)
insert into public.visitor_directory (tenant_id, full_name, company, id_document_type, id_document_number, email, phone)
select tenant_id, full_name, company, id_document_type, id_document_number, email, phone from latest
on conflict do nothing;

with keyed as (
  select v.id, v.tenant_id,
    coalesce(nullif(lower(trim(v.id_document_number)), ''), lower(trim(v.full_name)) || '|' || coalesce(lower(trim(v.company)), '')) as k
  from public.visitors v
  where v.directory_id is null
)
update public.visitors v
   set directory_id = d.id
  from keyed k
  join public.visitor_directory d
    on d.tenant_id = k.tenant_id
   and coalesce(nullif(lower(trim(d.id_document_number)), ''), lower(trim(d.full_name)) || '|' || coalesce(lower(trim(d.company)), '')) = k.k
 where v.id = k.id and v.directory_id is null;
