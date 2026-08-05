-- The one policy the branch-validation advisor sweep still flagged for per-row
-- auth re-evaluation: visitors_insert (0158) predates the (select ...) wrapping
-- convention. Rewrapped verbatim — no access change.

drop policy if exists "visitors_insert" on public.visitors;
create policy "visitors_insert" on public.visitors for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and (
      host_id = (select auth.uid())
      or (select public.is_tenant_admin())
      or (select public.has_module_permission('visitors', 'create'))
      or (select public.has_module_permission('visitors', 'operate'))
    )
  );
