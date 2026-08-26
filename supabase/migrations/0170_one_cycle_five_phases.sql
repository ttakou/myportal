-- =============================================================================
-- One cycle, five phases.
--
-- Goals Setting, Mid Year Review, Final Review, Annual Calibration and Final
-- Appraisal had been created as five separate CYCLES, so every employee held
-- four open appraisals for the same year, was counted once per cycle in every
-- figure, and received one copy of every notice per cycle.
--
-- This installs the five phases as a workflow template, attaches it to the one
-- surviving cycle, and removes the rest. New cycles pick the template up at
-- creation (see lib/performance/house-template.ts), so no cycle can be created
-- without the process again.
--
-- Everything with real content in the deleted cycles was copied to
-- appraisal_cleanup_backup_0170 first; deleting a cycle cascades to its
-- appraisals, goals and events.
-- =============================================================================

-- 1. The house template, one per tenant.
insert into public.cycle_templates (tenant_id, name, description, cycle_type, config)
select t.id,
       'Standard five-phase appraisal',
       'Goals Setting, Mid Year Review, Final Review, Annual Calibration, Final Appraisal. Each phase the employee takes part in runs: employee submits, manager reviews and comments, employee signs off, manager signs off.',
       'annual',
       '{"stages": [{"key": "goals_setting_submit", "label": "Goals Setting — employee submits", "responsibleRole": "employee", "dueOffsetDays": 68, "mandatory": true, "editableFields": ["goals", "key_results"], "allowApprove": false, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "goals_setting_review", "label": "Goals Setting — manager review and comment", "responsibleRole": "line_manager", "dueOffsetDays": 75, "mandatory": true, "editableFields": ["goals", "manager_comment"], "allowApprove": false, "allowReject": false, "allowReturn": true, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "goals_setting_employee_signoff", "label": "Goals Setting — employee sign-off", "responsibleRole": "employee", "dueOffsetDays": 82, "mandatory": true, "editableFields": ["employee_comment"], "allowApprove": true, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "goals_setting_signoff", "label": "Goals Setting — manager sign-off", "responsibleRole": "line_manager", "dueOffsetDays": 89, "mandatory": true, "editableFields": [], "allowApprove": true, "allowReject": false, "allowReturn": true, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "mid_year_submit", "label": "Mid Year Review — employee self-assessment", "responsibleRole": "employee", "dueOffsetDays": 159, "mandatory": true, "editableFields": ["self_rating", "employee_comment", "key_results"], "allowApprove": false, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "mid_year_review", "label": "Mid Year Review — manager review and comment", "responsibleRole": "line_manager", "dueOffsetDays": 166, "mandatory": true, "editableFields": ["manager_rating", "manager_comment"], "allowApprove": false, "allowReject": false, "allowReturn": true, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "mid_year_employee_signoff", "label": "Mid Year Review — employee sign-off", "responsibleRole": "employee", "dueOffsetDays": 173, "mandatory": true, "editableFields": ["employee_comment"], "allowApprove": true, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "mid_year_signoff", "label": "Mid Year Review — manager sign-off", "responsibleRole": "line_manager", "dueOffsetDays": 180, "mandatory": true, "editableFields": [], "allowApprove": true, "allowReject": false, "allowReturn": true, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "final_review_submit", "label": "Final Review — employee self-assessment", "responsibleRole": "employee", "dueOffsetDays": 317, "mandatory": true, "editableFields": ["self_rating", "employee_comment"], "allowApprove": false, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "final_review_review", "label": "Final Review — manager review and comment", "responsibleRole": "line_manager", "dueOffsetDays": 324, "mandatory": true, "editableFields": ["manager_rating", "manager_comment", "overall_rating"], "allowApprove": false, "allowReject": false, "allowReturn": true, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "final_review_employee_signoff", "label": "Final Review — employee sign-off", "responsibleRole": "employee", "dueOffsetDays": 331, "mandatory": true, "editableFields": ["employee_comment"], "allowApprove": true, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "final_review_signoff", "label": "Final Review — manager sign-off", "responsibleRole": "line_manager", "dueOffsetDays": 338, "mandatory": true, "editableFields": [], "allowApprove": true, "allowReject": false, "allowReturn": true, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "annual_calibration_signoff", "label": "Annual Calibration — committee sign-off", "responsibleRole": "calibration", "dueOffsetDays": 348, "mandatory": true, "editableFields": ["overall_rating"], "allowApprove": true, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "final_appraisal_rating", "label": "Final Appraisal — final rating recorded", "responsibleRole": "pgm", "dueOffsetDays": 356, "mandatory": true, "editableFields": ["overall_rating", "manager_comment"], "allowApprove": false, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "final_appraisal_employee_signoff", "label": "Final Appraisal — employee sign-off", "responsibleRole": "employee", "dueOffsetDays": 361, "mandatory": true, "editableFields": ["employee_comment"], "allowApprove": true, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}, {"key": "final_appraisal_signoff", "label": "Final Appraisal — manager sign-off", "responsibleRole": "line_manager", "dueOffsetDays": 364, "mandatory": true, "editableFields": [], "allowApprove": true, "allowReject": false, "allowReturn": false, "autoProgress": false, "parallelGroup": null, "condition": null, "notify": true}]}'::jsonb
from public.tenants t
where not exists (
  select 1 from public.cycle_templates ct
  where ct.tenant_id = t.id and ct.name = 'Standard five-phase appraisal'
);

-- 2. Attach it to the surviving cycle.
update public.appraisal_cycles c
   set template_id = ct.id,
       updated_at = now()
  from public.cycle_templates ct
 where ct.tenant_id = c.tenant_id
   and ct.name = 'Standard five-phase appraisal'
   and c.name = '2026 Annual Appraisal bis';

-- 3. "bis" was a stopgap name; it is the only cycle now, and it is the live
-- one. Its goal-setting date is set to match the first phase's close, since
-- anything not running the template still reads that column.
update public.appraisal_cycles
   set name = '2026 Annual Appraisal',
       status = 'active',
       goal_setting_deadline = coalesce(goal_setting_deadline, date '2026-03-31'),
       updated_at = now()
 where name = '2026 Annual Appraisal bis';

-- 4. Remove the rest. Cascades to their appraisals and everything under them.
delete from public.appraisal_cycles
 where name in (
   '2026 Annual Appraisal - Mid Year Review',
   '2026 Annual Appraisal - Final Review',
   '2026 Annual Appraisal - Calibration'
 )
    or (name = '2026 Annual Appraisal' and status = 'closed');
