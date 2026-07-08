-- Optional security comments captured at check-in and check-out, for both staff
-- attendance and visitors (single-day rows and long-stay pass gate entries).
-- Free-text notes reception/security may add "if they want to" — e.g. reason for
-- a late arrival, an escort note, a flagged behaviour, a lost badge.

alter table public.staff_attendance
  add column if not exists check_in_comment  text,
  add column if not exists check_out_comment text;

alter table public.visitors
  add column if not exists check_in_comment  text,
  add column if not exists check_out_comment text;

alter table public.visitor_checkins
  add column if not exists check_in_comment  text,
  add column if not exists check_out_comment text;
