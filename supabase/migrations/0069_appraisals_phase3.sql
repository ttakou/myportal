-- 0069: Appraisals Phase 3 — HR validation, final discussion, acknowledgement
-- and closure. Adds the discussion record + employee acknowledgement fields.

alter table public.appraisals
  add column if not exists discussion_date      date,
  add column if not exists discussion_notes     text,
  add column if not exists acknowledged_at      timestamptz,
  add column if not exists employee_agreed      boolean,
  add column if not exists employee_ack_comment text;
