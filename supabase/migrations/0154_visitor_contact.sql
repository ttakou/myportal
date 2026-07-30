-- Capture a visitor's contact details (email and/or phone) at registration /
-- check-in — optional, free text, so reception isn't blocked.

alter table public.visitors
  add column if not exists email text,
  add column if not exists phone text;
