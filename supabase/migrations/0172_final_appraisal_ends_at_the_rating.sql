-- =============================================================================
-- The process ends when the PGM records the rating.
--
-- Final Appraisal carried an employee sign-off and a manager sign-off after the
-- rating. There is nothing left to sign: every assessment the rating comes from
-- has already been signed off by both parties, phase by phase. Recording the
-- rating closes the phase and the cycle.
--
-- Edits the stage list in place rather than rewriting it, so a template edited
-- in the designer keeps whatever else was changed there.
-- =============================================================================

update public.cycle_templates
   set config = jsonb_set(
         config,
         '{stages}',
         coalesce(
           (
             select jsonb_agg(
                      case when s->>'key' = 'final_appraisal_rating'
                           -- Now the phase's closing step: it takes the phase's
                           -- own date, and the approval that closes it.
                           then s || '{"dueOffsetDays": 364, "allowApprove": true}'::jsonb
                           else s
                      end
                      order by ord
                    )
             from jsonb_array_elements(config->'stages') with ordinality t(s, ord)
             where s->>'key' not in (
               'final_appraisal_employee_signoff',
               'final_appraisal_signoff'
             )
           ),
           '[]'::jsonb
         )
       ),
       updated_at = now()
 where config ? 'stages'
   and exists (
     select 1 from jsonb_array_elements(config->'stages') s
     where s->>'key' in ('final_appraisal_employee_signoff', 'final_appraisal_signoff')
   );

-- Nobody can be sitting on a stage that no longer exists.
update public.appraisals
   set completed_stages = coalesce(
         (
           select jsonb_agg(k order by ord)
           from jsonb_array_elements(completed_stages) with ordinality t(k, ord)
           where k #>> '{}' not in (
             'final_appraisal_employee_signoff',
             'final_appraisal_signoff'
           )
         ),
         '[]'::jsonb
       ),
       updated_at = now()
 where completed_stages is not null
   and exists (
     select 1 from jsonb_array_elements(completed_stages) k
     where k #>> '{}' in ('final_appraisal_employee_signoff', 'final_appraisal_signoff')
   );
