-- Fill the safety fields with the module's help.
--
-- The fields the offshore module exists for were mostly empty: 100 of 216
-- staff had no muster station though 97 of them had a fixed cabin that names
-- one; certificate dates, emergency contacts and back-to-backs were blank for
-- nearly everyone. Two things here: the cabin now supplies the muster station
-- whenever nobody set one, and a person may declare their own certificates,
-- emergency contact and back-to-back from their dashboard.

-- 1) Muster station follows the fixed cabin.
update public.offshore_staff s
   set lifeboat = r.lifeboat
  from public.offshore_rooms r
 where r.id = s.fixed_room_id
   and s.lifeboat is null
   and r.lifeboat is not null;

create or replace function public.offshore_staff_lifeboat_from_room()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lifeboat is null and new.fixed_room_id is not null then
    select r.lifeboat into new.lifeboat
      from public.offshore_rooms r
     where r.id = new.fixed_room_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_offshore_staff_lifeboat_from_room on public.offshore_staff;
create trigger trg_offshore_staff_lifeboat_from_room
  before insert or update of fixed_room_id, lifeboat on public.offshore_staff
  for each row execute function public.offshore_staff_lifeboat_from_room();

-- 2) Self-declaration. RLS lets only the dispatcher write offshore_staff, and
-- that stays so; this function lets a person update five fields on their own
-- row and nothing else. A null argument leaves the field as it is.
create or replace function public.offshore_self_declare(
  p_medical_expiry date default null,
  p_bosiet_expiry date default null,
  p_huet_expiry date default null,
  p_emergency_contact text default null,
  p_back_to_back_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_tenant uuid;
begin
  select id, tenant_id into v_id, v_tenant
    from public.offshore_staff
   where profile_id = auth.uid()
   limit 1;
  if v_id is null then
    raise exception 'You are not on the offshore roster.';
  end if;
  if p_back_to_back_id is not null then
    if p_back_to_back_id = auth.uid() then
      raise exception 'Your back-to-back cannot be yourself.';
    end if;
    if not exists (
      select 1 from public.offshore_staff
       where profile_id = p_back_to_back_id and tenant_id = v_tenant
    ) then
      raise exception 'Your back-to-back must be on the offshore roster.';
    end if;
  end if;
  update public.offshore_staff
     set medical_expiry    = coalesce(p_medical_expiry, medical_expiry),
         bosiet_expiry     = coalesce(p_bosiet_expiry, bosiet_expiry),
         huet_expiry       = coalesce(p_huet_expiry, huet_expiry),
         emergency_contact = coalesce(nullif(btrim(p_emergency_contact), ''), emergency_contact),
         back_to_back_id   = coalesce(p_back_to_back_id, back_to_back_id),
         updated_at        = now()
   where id = v_id;
end;
$$;

revoke all on function public.offshore_self_declare(date, date, date, text, uuid) from public;
grant execute on function public.offshore_self_declare(date, date, date, text, uuid) to authenticated;
