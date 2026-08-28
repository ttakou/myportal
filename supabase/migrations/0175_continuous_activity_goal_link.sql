-- Tie a continuous activity to the objective it is about.
--
-- Goal updates asked "which goal, and where does it stand?" in a free-text box,
-- so the answer was a sentence rather than a link. Nothing could gather a
-- goal's updates, which is the one thing that makes them worth writing: at
-- mid-year the employee retyped from memory what they had already posted, and
-- the manager never saw any of it.
--
-- On delete set null, because removing an objective should not remove the
-- record that the work happened.

alter table public.continuous_activities
  add column if not exists goal_id uuid references public.appraisal_goals(id) on delete set null;

create index if not exists continuous_activities_goal_idx
  on public.continuous_activities (goal_id)
  where goal_id is not null;

-- Reading somebody's recognition or updates for a review is a subject+kind
-- lookup in date order, and there was no index for it.
create index if not exists continuous_activities_subject_kind_idx
  on public.continuous_activities (subject_id, kind, created_at desc);

comment on column public.continuous_activities.goal_id is
  'The objective this activity is about, when it is about one. Null for anything not tied to a goal. On delete set null so removing a goal never removes the record of the work.';
