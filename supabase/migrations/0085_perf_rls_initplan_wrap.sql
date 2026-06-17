-- 0085: Performance — wrap row-independent auth/role helpers in scalar
-- subselects so Postgres evaluates them once per query (InitPlan) instead of
-- once per row. Resolves the 70 `auth_rls_initplan` advisor warnings.
--
-- Semantically identical: `is_hr()` and `(select is_hr())` return the same
-- value; the subselect just lets the planner hoist the (row-independent) call
-- out of the per-row filter. Idempotent — each call is unwrapped then rewrapped,
-- so re-running never double-wraps and only ALTERs policies that actually change.

do $$
declare
  -- No-arg STABLE helpers + auth.uid(): all constant for a given request.
  fns text[] := array[
    'auth.uid()',
    'current_tenant_id()',
    'is_super_admin()',
    'is_tenant_admin()',
    'is_safety_admin()',
    'is_hr()',
    'is_canteen_manager()',
    'is_canteen_staff()',
    'is_finance()'
  ];
  r record;
  nq text;
  nc text;
  f text;
  clause text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    nq := r.qual;
    nc := r.with_check;

    -- Fixed-string helpers: unwrap-then-wrap makes this idempotent.
    foreach f in array fns loop
      if nq is not null then
        nq := replace(nq, '(select ' || f || ')', f);
        nq := replace(nq, f, '(select ' || f || ')');
      end if;
      if nc is not null then
        nc := replace(nc, '(select ' || f || ')', f);
        nc := replace(nc, f, '(select ' || f || ')');
      end if;
    end loop;

    -- has_role(<constant>): same idea, regex to keep the constant argument.
    if nq is not null then
      nq := regexp_replace(nq, '\(select (has_role\([^()]*\))\)', '\1', 'g');
      nq := regexp_replace(nq, 'has_role\(([^()]*)\)', '(select has_role(\1))', 'g');
    end if;
    if nc is not null then
      nc := regexp_replace(nc, '\(select (has_role\([^()]*\))\)', '\1', 'g');
      nc := regexp_replace(nc, 'has_role\(([^()]*)\)', '(select has_role(\1))', 'g');
    end if;

    if (r.qual is distinct from nq) or (r.with_check is distinct from nc) then
      clause := '';
      if nq is not null then clause := clause || format(' using (%s)', nq); end if;
      if nc is not null then clause := clause || format(' with check (%s)', nc); end if;
      execute format('alter policy %I on %I.%I%s', r.policyname, r.schemaname, r.tablename, clause);
    end if;
  end loop;
end $$;
