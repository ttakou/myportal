-- Who confirmed a run (the Dispatcher, once the boat or helicopter has gone)
-- and when: the record that the manifest reflects what really happened.
alter table public.offshore_manifests
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists confirmed_at timestamptz;
