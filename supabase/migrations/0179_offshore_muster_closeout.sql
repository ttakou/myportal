-- Close out musters properly.
--
-- A roll-call had two states per person, ticked or not, and one per drill,
-- open or ended. Ending a drill with people unticked left rows that said
-- nothing: seven drills carried 945 "unaccounted" rows and nobody could say
-- whether those people failed to muster, were never on board, or the drill
-- was a test somebody abandoned. Each person now gets an outcome, and a drill
-- is closed out (every outcome recorded, a note, who closed it) or voided.

alter table public.offshore_muster_checkins
  add column if not exists outcome text
    check (outcome in ('accounted', 'no_show', 'not_on_board'));

-- Ticked means accounted; the boolean stays for the code that reads it.
update public.offshore_muster_checkins
   set outcome = 'accounted'
 where accounted and outcome is null;

alter table public.offshore_muster_drills
  add column if not exists closed_out_at timestamptz,
  add column if not exists closed_out_by uuid references public.profiles(id) on delete set null,
  add column if not exists close_note text,
  add column if not exists voided boolean not null default false;

create index if not exists idx_offshore_muster_drills_closed_out_by
  on public.offshore_muster_drills (closed_out_by);
