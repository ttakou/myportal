-- =============================================================================
-- Pending (tenant-less) accounts: self-read + access-request tracking
-- =============================================================================
-- A first-time sign-in (email/password, invite, OR SSO) inserts a bare profile
-- with tenant_id = NULL (see handle_new_user). Such a user can't see any module
-- and, until now, couldn't even read their own profile row, because the only
-- SELECT policy on profiles is "same tenant or super admin". This:
--
--   1. lets a user read their OWN profile (always safe), so the "awaiting
--      access" screen and the middleware redirect can tell a tenant-less user
--      apart from an onboarded one; and
--   2. records when a pending user asks an administrator for access, which
--      surfaces in the admin "Pending users" queue and throttles re-notifies.
-- =============================================================================

-- 1. Self-read. Additive (OR) alongside the existing same-tenant policy; reading
--    one's own row is always permitted and never crosses a tenant boundary.
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- 2. When (and whether) the holder has asked an admin to be granted access.
alter table public.profiles
  add column if not exists access_requested_at timestamptz;

comment on column public.profiles.access_requested_at is
  'Set when a tenant-less user requests access from the awaiting-access screen; '
  'cleared once an admin assigns them to a tenant.';
