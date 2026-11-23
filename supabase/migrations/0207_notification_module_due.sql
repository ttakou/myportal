-- Notifications: which module each one comes from (so the bell can keep
-- offshore apart from performance and transport), the deadline of a decision
-- it asks for (pinned as "decide before tonight's run" until then), and the
-- request it is about (so deciding it clears the notice for everyone told).
alter table public.notifications
  add column if not exists module text,
  add column if not exists due_at timestamptz,
  add column if not exists ref text;

create index if not exists notifications_ref_open_idx
  on public.notifications (ref) where ref is not null and read_at is null;

-- Existing rows: the module is the first segment of the link.
update public.notifications
  set module = nullif(split_part(split_part(split_part(url, '?', 1), '#', 1), '/', 2), '')
  where module is null and url like '/%';

-- Crew reminders linked to the dashboard are offshore notices.
update public.notifications
  set module = 'offshore'
  where (module is null or module = 'dashboard')
    and (title ilike '%crew change%' or title ilike 'your back-to-back%' or title ilike 'crew %mobilised%');
