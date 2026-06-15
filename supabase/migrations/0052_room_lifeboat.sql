-- Muster / lifeboat group is a property of the room; occupants inherit it.
alter table public.offshore_rooms add column if not exists lifeboat text;
