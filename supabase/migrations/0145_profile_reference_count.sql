-- =============================================================================
-- Safe duplicate detection for SSO account auto-linking
-- =============================================================================
-- When a first SSO sign-in lands as a tenant-less profile that matches an
-- existing org account by email, we only auto-adopt the existing registration
-- when it's a *pristine* stub — nothing depends on it. This function counts how
-- many rows across the whole schema still reference a given profile id, so the
-- caller can refuse to touch an account that already has savings, offshore,
-- training, etc. history (which would need a real merge, not an auto-link).
--
-- The role/link tables are excluded because the caller copies those onto the
-- adopting account; everything else (incl. profiles.manager_id, i.e. "is this
-- person someone's manager") counts as a dependent and blocks auto-adoption.
-- =============================================================================

create or replace function public.profile_external_reference_count(p_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  total bigint := 0;
  cnt bigint;
begin
  for r in
    select tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'profiles'
      and ccu.column_name = 'id'
      and not (tc.table_schema = 'public'
               and tc.table_name in ('profile_roles', 'profile_access_roles'))
  loop
    execute format('select count(*) from %I.%I where %I = $1', r.table_schema, r.table_name, r.column_name)
      into cnt using p_id;
    total := total + cnt;
  end loop;
  return total;
end;
$$;

-- Trusted backend only (the SSO callback uses the service role); never exposed
-- to end users.
revoke execute on function public.profile_external_reference_count(uuid) from anon, authenticated, public;
grant execute on function public.profile_external_reference_count(uuid) to service_role;
