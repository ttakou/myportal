-- Visitors: a group visit. A delegation registered on one form shares a
-- group id; the board shows them together and checks the whole group in
-- or out at once. Each member stays an ordinary visitor row (badge, ID,
-- directory record, muster headcount).

alter table public.visitors add column if not exists group_id uuid;
create index if not exists idx_visitors_group on public.visitors (group_id) where group_id is not null;
