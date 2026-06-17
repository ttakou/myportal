-- 0080: Calibration committee adjustments.
--
-- HR/committee can adjust an appraisal's final score (and its derived rating
-- label) during calibration, with a reason and a full audit trail. The
-- adjustment log is committee-confidential (HR/admins only); the resulting
-- final_score / rating_label on the appraisal remains visible to the employee.

create table public.appraisal_calibration_adjustments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  appraisal_id   uuid not null references public.appraisals(id) on delete cascade,
  cycle_id       uuid not null references public.appraisal_cycles(id) on delete cascade,
  previous_score numeric,
  previous_label text,
  new_score      numeric,
  new_label      text,
  reason         text,
  adjusted_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index on public.appraisal_calibration_adjustments(cycle_id);
create index on public.appraisal_calibration_adjustments(appraisal_id);

alter table public.appraisal_calibration_adjustments enable row level security;

-- HR / tenant admins / super admins only.
create policy "aca_hr_all" on public.appraisal_calibration_adjustments for all to authenticated
  using (public.is_super_admin()
         or (tenant_id = public.current_tenant_id()
             and (public.is_hr() or public.is_tenant_admin())))
  with check (public.is_super_admin()
         or (tenant_id = public.current_tenant_id()
             and (public.is_hr() or public.is_tenant_admin())));
