alter table public.notification_preferences add column if not exists email boolean not null default true;
