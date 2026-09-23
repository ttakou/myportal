-- The fleet register: what a vehicle runs on and who it is assigned to.
-- A vehicle with no assignee is in the pool the dispatch desk draws from;
-- one assigned to a post (the Operations Manager's Prado, say) still shows
-- on the pickers, labelled, so the desk knows it is spoken for.
alter table public.transport_vehicles
  add column if not exists fuel text check (fuel in ('diesel', 'gasoline', 'hybrid', 'electric')),
  add column if not exists assigned_to text;

comment on column public.transport_vehicles.fuel is 'diesel | gasoline | hybrid | electric';
comment on column public.transport_vehicles.assigned_to is 'Post or person the vehicle is assigned to; null = pool vehicle';
