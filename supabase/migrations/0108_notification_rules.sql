-- Configurable notifications: HR defines rules per event (recipients, channels,
-- template, timing, frequency, escalation) instead of hard-coded sends.

create table if not exists public.notification_rules (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  event              text not null,
  -- recipient roles relative to the subject: employee / line_manager /
  -- second_level / hr / calibration  (plus optional explicit addresses)
  recipients         jsonb not null default '["employee"]'::jsonb,
  custom_emails      jsonb not null default '[]'::jsonb,
  channels           jsonb not null default '["in_app"]'::jsonb,
  subject_template   text,
  body_template      text,
  timing             text not null default 'immediate',   -- immediate | before | after
  offset_days        smallint not null default 0,
  frequency          text not null default 'once',        -- once | daily | until_complete
  escalate_after_days smallint,
  escalate_to        text,                                 -- a recipient role
  is_enabled         boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint notification_rules_event_chk check (event in (
    'cycle_launch','goal_submission','approval_request','goal_rejection',
    'upcoming_deadline','overdue_task','review_completed','rating_changed',
    'calibration_completed','acknowledgement_required'
  )),
  constraint notification_rules_timing_chk check (timing in ('immediate','before','after')),
  constraint notification_rules_freq_chk check (frequency in ('once','daily','until_complete'))
);

create index if not exists notification_rules_tenant_idx on public.notification_rules (tenant_id, event);

alter table public.notification_rules enable row level security;

drop policy if exists "notification_rules_select" on public.notification_rules;
create policy "notification_rules_select" on public.notification_rules for select to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())));

drop policy if exists "notification_rules_manage" on public.notification_rules;
create policy "notification_rules_manage" on public.notification_rules for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))));

-- Seed a sensible default rule per event for every tenant.
insert into public.notification_rules
  (tenant_id, event, recipients, channels, subject_template, body_template, timing, offset_days, frequency, escalate_after_days, escalate_to)
select t.id, d.event, d.recipients::jsonb, d.channels::jsonb, d.subject, d.body, d.timing, d.offset_days, d.frequency, d.escalate_after_days, d.escalate_to
from public.tenants t
cross join (values
  ('cycle_launch',          '["employee"]',                '["in_app","email"]', 'New appraisal cycle: {{cycle}}',        'The {{cycle}} appraisal cycle has launched — please set your goals.', 'immediate', 0,  'once',           null::smallint, null),
  ('goal_submission',       '["line_manager"]',            '["in_app"]',         'Goals submitted by {{employee}}',       '{{employee}} submitted goals for your review.',                      'immediate', 0,  'once',           null, null),
  ('approval_request',      '["line_manager"]',            '["in_app","email"]', 'Approval needed: {{employee}}',         '{{employee}} is awaiting your approval.',                             'immediate', 0,  'once',           7,    'second_level'),
  ('goal_rejection',        '["employee"]',                '["in_app","email"]', 'Your goals were returned',              'Your goals were returned for changes: {{reason}}',                    'immediate', 0,  'once',           null, null),
  ('upcoming_deadline',     '["employee"]',                '["in_app","email"]', 'Deadline approaching: {{deadline}}',    'Your appraisal task is due on {{deadline}}.',                         'before',    3,  'daily',          null, null),
  ('overdue_task',          '["employee","line_manager"]', '["in_app","email"]', 'Overdue appraisal task',               'An appraisal task is overdue — please action it.',                    'after',     0,  'daily',          7,    'hr'),
  ('review_completed',      '["employee"]',                '["in_app","email"]', 'Your review is complete',              'Your performance review has been completed.',                         'immediate', 0,  'once',           null, null),
  ('rating_changed',        '["employee","line_manager"]', '["in_app"]',         'Rating updated',                       'A performance rating was changed to {{rating}}.',                     'immediate', 0,  'once',           null, null),
  ('calibration_completed', '["hr","line_manager"]',       '["in_app"]',         'Calibration completed',                'Calibration for {{cycle}} is complete.',                              'immediate', 0,  'once',           null, null),
  ('acknowledgement_required','["employee"]',              '["in_app","email"]', 'Acknowledgement required',             'Please review and acknowledge your appraisal.',                       'immediate', 0,  'until_complete', 5,    'line_manager')
) as d(event, recipients, channels, subject, body, timing, offset_days, frequency, escalate_after_days, escalate_to)
where not exists (
  select 1 from public.notification_rules r where r.tenant_id = t.id and r.event = d.event
);
