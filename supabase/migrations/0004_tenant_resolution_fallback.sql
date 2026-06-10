-- =============================================================================
-- Tenant/role resolution fallback
-- =============================================================================
-- Make RLS work whether or not the custom access token hook is enabled.
-- current_tenant_id()/current_user_role() prefer the JWT claim (set by the hook)
-- but fall back to a profile lookup when the claim is absent.
--
-- The lookup is SECURITY DEFINER so it bypasses RLS on `profiles` (no recursion)
-- and lives in a private schema that PostgREST does not expose, so it is not
-- callable via the API and does not trip the security advisor.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated, public;
grant usage on schema private to authenticated;

create or replace function private.uid_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function private.uid_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function private.uid_tenant_id() to authenticated;
grant execute on function private.uid_role() to authenticated;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    private.uid_tenant_id()
  );
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'user_role', '')::public.user_role,
    private.uid_role(),
    'employee'::public.user_role
  );
$$;
