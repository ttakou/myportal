-- Linking a first sign-in (Microsoft or Google) to the account the
-- organisation already holds for that person, so they don't end up with two.
--
-- merge_profile_into(p_from, p_to) moves everything that points at the old
-- account (trips, crew, room, roles, history…) onto the new sign-in account,
-- gives it the old account's place in the organisation, and retires the old
-- one. All in one transaction. A table where the new account already has its
-- own row (a per-person unique row), or that refuses edits, keeps it; the old row
-- stays behind and the old account is then only deactivated, never deleted,
-- so nothing is lost. Service role only.
create or replace function public.merge_profile_into(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n bigint;
  moved bigint := 0;
  skipped text[] := '{}';
  f public.profiles%rowtype;
  t public.profiles%rowtype;
  left_refs bigint;
  fresh boolean;
begin
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'Pick two different accounts.';
  end if;
  select * into f from public.profiles where id = p_from for update;
  select * into t from public.profiles where id = p_to for update;
  if f.id is null or t.id is null then raise exception 'Account not found.'; end if;
  if f.tenant_id is null then raise exception 'The existing account is not in an organisation.'; end if;
  if t.tenant_id is not null and t.tenant_id <> f.tenant_id then
    raise exception 'The two accounts belong to different organisations.';
  end if;
  fresh := t.tenant_id is null;

  -- The employee number is unique: free it before it moves.
  update public.profiles set emp_num = null where id = p_from;

  -- Every single-column foreign key in public that points at a person.
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_class k on k.oid = c.conrelid
    join pg_namespace ns on ns.oid = k.relnamespace
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and ns.nspname = 'public'
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and not (c.conrelid = 'public.profiles'::regclass and a.attname = 'id')
  loop
    begin
      execute format('update %s set %I = $2 where %I = $1', r.tbl, r.col, r.col) using p_from, p_to;
      get diagnostics n = row_count;
      moved := moved + n;
    exception when others then
      -- A per-person unique row the new account already has, or a table that
      -- refuses edits (an audit log): leave those rows on the old account.
      skipped := skipped || (r.tbl::text || '.' || r.col);
    end;
  end loop;

  -- The organisation's view of the person comes from the existing account;
  -- the sign-in keeps its own name and email.
  update public.profiles set
    tenant_id = f.tenant_id,
    role = case when fresh then f.role else t.role end,
    manager_id = case when fresh then f.manager_id else coalesce(t.manager_id, f.manager_id) end,
    department = case when fresh then f.department else coalesce(t.department, f.department) end,
    emp_num = coalesce(t.emp_num, f.emp_num),
    employee_type = case when fresh then f.employee_type else t.employee_type end,
    lunch_eligible = case when fresh then f.lunch_eligible else t.lunch_eligible end,
    job_title = coalesce(t.job_title, f.job_title),
    appraisal_delegate_id = coalesce(t.appraisal_delegate_id, f.appraisal_delegate_id),
    full_name = coalesce(nullif(trim(t.full_name), ''), f.full_name),
    is_active = true,
    access_requested_at = null
  where id = p_to;

  update public.profiles set is_active = false where id = p_from;

  -- Remove the old account only when nothing points at it any more.
  select public.profile_external_reference_count(p_from)
       + (select count(*) from public.profile_roles where profile_id = p_from)
       + (select count(*) from public.profile_access_roles where profile_id = p_from)
    into left_refs;
  if left_refs = 0 then
    delete from auth.users where id = p_from;
  end if;

  return jsonb_build_object('moved', moved, 'kept_old', skipped, 'removed', left_refs = 0);
end;
$$;

revoke execute on function public.merge_profile_into(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_profile_into(uuid, uuid) to service_role;

-- The organisation's own email domains: a sign-in from one of these may be
-- linked automatically to the matching roster account. Others never are.
update public.tenants
  set settings = coalesce(settings, '{}'::jsonb) || '{"sso_domains": ["cm.addaxpetroleum.com", "addaxpetroleum.com"]}'::jsonb
  where id = 'f3c95dd2-3fa4-417b-9477-1aa260549fd2';
