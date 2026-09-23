-- The person who holds an assigned vehicle. assigned_to names the post
-- ("Operations Manager"); holder_id names who currently fills it, so the
-- desk sees a name and can reach them. Cleared when the profile goes.
alter table public.transport_vehicles
  add column if not exists holder_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_transport_vehicles_holder on public.transport_vehicles(holder_id) where holder_id is not null;

comment on column public.transport_vehicles.holder_id is 'Profile of the person holding the vehicle (assigned vehicles); null when unknown or pool';
