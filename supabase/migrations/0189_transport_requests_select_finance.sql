-- Finance reads the transportation reports: every request in the tenant,
-- read-only. The desk (approve / manage verb holders) already reads them
-- through the admin path or their own rows; this closes the gap for the
-- finance functional role.
drop policy if exists transport_requests_select_finance on public.transport_requests;
create policy transport_requests_select_finance on public.transport_requests
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.is_finance()));
