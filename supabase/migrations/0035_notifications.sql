-- =============================================================================
-- Unified in-app notifications.
--
-- One row per recipient per event. Written server-side (service role) by the
-- shared notify pipeline alongside Web Push, so every push also lands in the
-- in-app bell — and users with push off still see it. Recipients read and mark
-- their own; nobody writes via the API.
-- =============================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category   text not null default 'general'
             check (category in ('emergency','transport','flight','approval','general')),
  title      text not null,
  body       text,
  url        text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient
  on public.notifications(profile_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications(profile_id) where read_at is null;

alter table public.notifications enable row level security;

-- Recipients see and update (mark read) only their own. Inserts are service-role
-- only (the notify pipeline), so no insert policy is granted to authenticated.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
