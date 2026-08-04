-- =============================================================================
-- Access delegation.
--
-- A user may delegate their access to a colleague for a bounded period (e.g.
-- while on leave). The delegate keeps their own identity but, for the active
-- window, gains the delegator's access-role module permissions and functional
-- roles — a UNION, never a replacement. Admin/privileged roles are NEVER
-- delegable (see the guard in uid_has_role), so delegation can't be used to
-- escalate to an administrator.
-- =============================================================================

create table if not exists public.access_delegations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  delegator_id uuid not null references public.profiles(id) on delete cascade,
  delegate_id  uuid not null references public.profiles(id) on delete cascade,
  starts_on    date not null,
  ends_on      date not null,
  note         text,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  constraint access_delegations_not_self check (delegator_id <> delegate_id),
  constraint access_delegations_dates check (ends_on >= starts_on)
);
create index if not exists idx_access_delegations_delegate on public.access_delegations(delegate_id);
create index if not exists idx_access_delegations_delegator on public.access_delegations(delegator_id);

alter table public.access_delegations enable row level security;

-- Read: the two parties, plus tenant/super admins.
drop policy if exists "access_delegations_select" on public.access_delegations;
create policy "access_delegations_select" on public.access_delegations for select to authenticated
  using (
    delegator_id = auth.uid()
    or delegate_id = auth.uid()
    or public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  );

-- Create: a user delegates FROM themselves, within their own tenant. Admins may
-- also create on someone's behalf.
drop policy if exists "access_delegations_insert" on public.access_delegations;
create policy "access_delegations_insert" on public.access_delegations for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (
      delegator_id = auth.uid()
      or public.is_super_admin()
      or public.is_tenant_admin()
    )
  );

-- Revoke / edit: the delegator or an admin.
drop policy if exists "access_delegations_update" on public.access_delegations;
create policy "access_delegations_update" on public.access_delegations for update to authenticated
  using (
    delegator_id = auth.uid()
    or public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  )
  with check (
    delegator_id = auth.uid()
    or public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  );

drop policy if exists "access_delegations_delete" on public.access_delegations;
create policy "access_delegations_delete" on public.access_delegations for delete to authenticated
  using (
    delegator_id = auth.uid()
    or public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  );

-- The delegators who have granted their access to `p_user` right now (active,
-- not revoked, within the date window). SECURITY DEFINER so the permission
-- functions below can consult it without widening the table's own RLS.
create or replace function public.delegators_for(p_user uuid) returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select delegator_id
    from public.access_delegations
   where delegate_id = p_user
     and revoked_at is null
     and current_date between starts_on and ends_on;
$$;
revoke all on function public.delegators_for(uuid) from public, anon;
grant execute on function public.delegators_for(uuid) to authenticated;

-- Functional-role check, now delegation-aware. The caller's OWN roles always
-- count; a delegated role counts too EXCEPT the privileged admin roles, which
-- are never delegable (no privilege escalation via delegation).
create or replace function private.uid_has_role(r public.functional_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profile_roles pr
    where pr.role = r
      and (
        pr.profile_id = auth.uid()
        or (
          r not in ('system_admin', 'hr_admin')
          and pr.profile_id in (select public.delegators_for(auth.uid()))
        )
      )
  );
$$;

-- Access-role verb check, now delegation-aware (module permissions are never
-- privileged, so no admin exclusion is needed here).
create or replace function public.has_module_permission(p_module text, p_verb text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profile_access_roles par
    join public.tenant_roles tr on tr.id = par.role_id
    where tr.tenant_id = public.current_tenant_id()
      and (tr.permissions -> p_module) ? p_verb
      and (
        par.profile_id = auth.uid()
        or par.profile_id in (select public.delegators_for(auth.uid()))
      )
  );
$$;

-- Let a delegate read their active delegators' role assignments, so the
-- application's permission resolution can union them (the sidebar, page gates
-- and server-action guards read these tables directly under RLS). Reading which
-- roles a delegator holds is not the same as being granted them — the
-- privileged-role exclusion above still applies.
drop policy if exists "profile_access_roles_select_delegate" on public.profile_access_roles;
create policy "profile_access_roles_select_delegate" on public.profile_access_roles for select to authenticated
  using (profile_id in (select public.delegators_for(auth.uid())));

drop policy if exists "profile_roles_select_delegate" on public.profile_roles;
create policy "profile_roles_select_delegate" on public.profile_roles for select to authenticated
  using (profile_id in (select public.delegators_for(auth.uid())));
