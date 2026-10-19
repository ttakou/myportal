-- Email digests: a notification is emailed at most once, either at once
-- (emergency and other always-on categories) or in the next morning digest.
-- `emailed_at` records it. Everything already in the bell is marked as
-- handled so the first digest does not mail out the backlog.
alter table public.notifications add column if not exists emailed_at timestamptz;

update public.notifications set emailed_at = created_at where emailed_at is null;

create index if not exists idx_notifications_email_pending
  on public.notifications (created_at)
  where emailed_at is null;
