create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  tenant_id uuid,
  table_name text not null,
  op text not null,
  row_id text,
  changes jsonb
);
create index if not exists audit_log_tenant_at on public.audit_log (tenant_id, at desc);
create index if not exists audit_log_table_at on public.audit_log (table_name, at desc);

alter table public.audit_log enable row level security;
drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log for select to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  newj jsonb;
  oldj jsonb;
  tid uuid;
  rid text;
  ch jsonb;
begin
  if tg_op <> 'DELETE' then newj := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then oldj := to_jsonb(old); end if;

  begin tid := (coalesce(newj, oldj) ->> 'tenant_id')::uuid; exception when others then tid := null; end;
  rid := coalesce(newj, oldj) ->> 'id';

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('from', oldj -> key, 'to', newj -> key))
      into ch
    from (select key from jsonb_object_keys(newj) as t(key)) k
    where (oldj -> key) is distinct from (newj -> key)
      and key not in ('updated_at');
    if ch is null then return new; end if;
  elsif tg_op = 'INSERT' then
    ch := newj;
  else
    ch := oldj;
  end if;

  insert into public.audit_log (actor_id, tenant_id, table_name, op, row_id, changes)
  values (auth.uid(), tid, tg_table_name, tg_op, rid, ch);

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

do $$
declare t text;
declare tables text[] := array[
  'airport_assistance','canteen_booking_options','canteen_bookings','canteen_dishes','canteen_feedback',
  'canteen_kitchens','canteen_option_groups','canteen_options','eess_broadcasts','eess_checkins',
  'eess_incidents','helicopter_flights','loan_repayments','loans','medical_records','nine_box',
  'offshore_bed_allocations','offshore_crews','offshore_emergency_roles','offshore_installations',
  'offshore_manifest_pax','offshore_manifests','offshore_meal_entries','offshore_rooms','offshore_staff',
  'offshore_trips','offshore_visit_requests','okr_key_results','okr_objectives','out_of_town_trips',
  'perf_feedback','profile_access_roles','profile_roles','profiles','savings_accounts','savings_transactions',
  'tenant_roles','tenant_services','transport_drivers','transport_requests','transport_task_checklist',
  'transport_task_updates','transport_vehicles','travel_emergency_contacts','trip_checkins','trip_expenses','visitors'
];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;
