-- =============================================================================
-- Training requests — explicit request *types* (creation workflows).
--
-- `origin` records where a request came from (the source taxonomy). This adds
-- the orthogonal `request_type`: who raised it, the target, and whether it is a
-- pending request or an already-authorized assignment. Seven types:
--   individual      employee raises for themselves                  (Requested)
--   manager         line manager raises for a direct report         (Manager-approved)
--   departmental    Training Admin raises across a department        (Requested)
--   competency_gap  employee raises from a competency gap            (Requested)
--   appraisal       employee raises from their development plan      (Requested)
--   statutory       Training Admin assigns mandatory training        (Approved + plan item)
--   adhoc           Training Admin assigns one-off training          (Approved + plan item)
-- =============================================================================

alter table public.training_requests
  add column if not exists request_type text;

alter table public.training_requests
  drop constraint if exists training_requests_request_type_chk;
alter table public.training_requests
  add constraint training_requests_request_type_chk check (
    request_type is null or request_type in (
      'individual','manager','departmental','competency_gap','appraisal','statutory','adhoc'
    )
  );

-- Backfill existing rows from their origin.
update public.training_requests set request_type = case
  when origin = 'manager_request' then 'manager'
  when origin = 'competency_gap' then 'competency_gap'
  when origin in ('performance_appraisal','personal_development_plan') then 'appraisal'
  else 'individual'
end
where request_type is null;

create index if not exists idx_training_requests_type on public.training_requests(request_type);

-- A line manager may raise a request *for one of their direct reports*.
-- (Training Admins / tenant admins already insert via the admin_all policy.)
drop policy if exists "training_requests_insert_manager" on public.training_requests;
create policy "training_requests_insert_manager" on public.training_requests for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_my_training_report(profile_id)
  );
