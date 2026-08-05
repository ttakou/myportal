-- =============================================================================
-- Non-rotational offshore staff, registrable by front-line roles.
--
-- Until now everyone on the offshore roster was implicitly a rotator: the
-- roster exists to drive crew cycles, and the only way to put a non-rotator on
-- board was to log them as a *casual visitor* — which mislabels a working
-- contractor as a guest on the POB and the muster roll.
--
-- Two changes:
--   1. offshore_staff.is_rotational marks a roster row as a non-rotator (no
--      crew, no cycle). Defaults true so every existing row keeps its meaning.
--   2. Writes to offshore_staff are opened up — narrowly — to holders of the
--      offshore `create` module verb, but ONLY for non-rotational rows. That
--      lets a Receptionist / Radio Operator / Operations Supervisor register a
--      short-term worker without gaining any power over crew rotation. Full
--      managers (admin / Campboss / OIM) are unchanged via is_offshore_manager().
--
-- The three access roles are seeded at the bottom, one per tenant.
-- =============================================================================

alter table public.offshore_staff
  add column if not exists is_rotational boolean not null default true;

comment on column public.offshore_staff.is_rotational is
  'False for short-term / ad-hoc personnel who work offshore but sit outside the crew rotation. Non-rotators carry no crew_id and are skipped by the rotation maths.';

-- A non-rotator has no rotation crew, by definition. Enforced rather than
-- merely conventional so the rotation maths can trust crew_id alone.
alter table public.offshore_staff drop constraint if exists offshore_staff_non_rotational_no_crew_chk;
alter table public.offshore_staff add constraint offshore_staff_non_rotational_no_crew_chk
  check (is_rotational or crew_id is null);

-- Listing the roster filtered to non-rotators is the registrar's main read.
create index if not exists idx_offshore_staff_non_rotational
  on public.offshore_staff (tenant_id) where not is_rotational;

-- ---- Policies ---------------------------------------------------------------
-- `offshore_staff_admin` was a FOR ALL policy stacked on top of the SELECT
-- policy, so every read evaluated both. Splitting it per action removes that
-- duplication and gives INSERT/UPDATE a home for the registrar arm.
--
-- SELECT is an exact union preserve: the dropped admin arm was
--   super_admin OR (tenant AND manager)
-- which is wholly contained in the surviving offshore_staff_select
--   tenant OR super_admin
-- so no reader loses or gains access.

drop policy if exists "offshore_staff_admin" on public.offshore_staff;

drop policy if exists "offshore_staff_insert" on public.offshore_staff;
create policy "offshore_staff_insert" on public.offshore_staff for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_offshore_manager())
        -- Registrars may only ever create non-rotators.
        or (not is_rotational and (select public.has_module_permission('offshore', 'create')))
      )
    )
  );

drop policy if exists "offshore_staff_update" on public.offshore_staff;
create policy "offshore_staff_update" on public.offshore_staff for update to authenticated
  using (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_offshore_manager())
        or (not is_rotational and (select public.has_module_permission('offshore', 'create')))
      )
    )
  )
  -- The same test on the new row stops a registrar promoting a non-rotator into
  -- the rotation (or moving one to another tenant).
  with check (
    (select public.is_super_admin())
    or (
      tenant_id = (select public.current_tenant_id())
      and (
        (select public.is_offshore_manager())
        or (not is_rotational and (select public.has_module_permission('offshore', 'create')))
      )
    )
  );

-- Removing someone from the roster stays a manager's call.
drop policy if exists "offshore_staff_delete" on public.offshore_staff;
create policy "offshore_staff_delete" on public.offshore_staff for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_offshore_manager()))
  );

-- ---- Seeded access roles ----------------------------------------------------
-- One per tenant, each granting the offshore module with view + create. The
-- `create` verb is what the registration action and the policies above test;
-- it carries no power over crews, manifests, POB or accommodation.
--
-- A tenant that already has a role under one of these names (e.g. a
-- "Receptionist" created for the Visitors module) is NOT duplicated — the
-- offshore slug and the two verbs are merged into the existing role instead, so
-- the person keeps whatever else that role already granted.

do $$
declare
  r record;
  role_name text;
  role_desc text;
begin
  for role_name, role_desc in
    select * from (values
      ('Receptionist',
       'Front desk — registers non-rotational offshore staff and contractors.'),
      ('Radio Operator',
       'Radio room — registers non-rotational offshore staff and contractors.'),
      ('Operations Supervisor',
       'Operations supervisor — registers non-rotational offshore staff and contractors.')
    ) as v(n, d)
  loop
    for r in select id from public.tenants loop
      if exists (
        select 1 from public.tenant_roles
        where tenant_id = r.id and name = role_name
      ) then
        update public.tenant_roles tr
          set module_slugs = (
                select array(select distinct unnest(coalesce(tr.module_slugs, '{}') || array['offshore']))
              ),
              permissions = jsonb_set(
                coalesce(tr.permissions, '{}'::jsonb),
                '{offshore}',
                (
                  select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
                  from jsonb_array_elements(
                    coalesce(tr.permissions -> 'offshore', '[]'::jsonb)
                      || '["view","create"]'::jsonb
                  ) as v
                ),
                true)
        where tr.tenant_id = r.id and tr.name = role_name;
      else
        insert into public.tenant_roles (tenant_id, name, description, module_slugs, permissions)
        values (r.id, role_name, role_desc, array['offshore']::text[], '{"offshore":["view","create"]}'::jsonb)
        on conflict (tenant_id, name) do nothing;
      end if;
    end loop;
  end loop;
end$$;
