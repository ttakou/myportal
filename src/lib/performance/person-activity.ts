import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/row-helpers";
import type { GoalActivity, PersonActivity } from "./goal-activity";

const SELECT =
  "id, kind, goal_id, title, body, created_at, is_private, is_anonymous, author:profiles!author_id(full_name)";
const SELECT_MANY =
  "id, subject_id, kind, goal_id, title, body, created_at, is_private, is_anonymous, author:profiles!author_id(full_name)";

type Row = {
  id: string;
  kind: string;
  goal_id: string | null;
  title: string | null;
  body: string | null;
  created_at: string;
  is_private: boolean | null;
  is_anonymous: boolean | null;
  author?: { full_name?: string } | { full_name?: string }[] | null;
};

function toActivity(r: Row): GoalActivity {
  return {
    id: r.id,
    goalId: r.goal_id,
    title: r.title,
    body: r.body,
    // Anonymous feedback stays anonymous wherever it is shown; a name attached
    // here would undo the promise made where it was written.
    authorName: r.is_anonymous ? null : (one<{ full_name?: string }>(r.author)?.full_name ?? null),
    createdAt: r.created_at,
  };
}

/**
 * One person's goal updates and recognition, for showing at a review.
 *
 * Private entries are left out: they were written on the understanding that
 * nobody else reads them, and a review is emphatically somebody else reading
 * them.
 */
export async function personActivity(
  subjectId: string,
  since?: string | null,
): Promise<PersonActivity> {
  const supabase = createClient();
  let query = supabase
    .from("continuous_activities")
    .select(SELECT)
    .eq("subject_id", subjectId)
    .in("kind", ["goal_update", "recognition"])
    .or("is_private.is.null,is_private.eq.false")
    .order("created_at", { ascending: false })
    .limit(60);
  // A review looks at this cycle, not everything the person has ever posted.
  if (since) query = query.gte("created_at", since);

  const { data } = await query;
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({ row: r, item: toActivity(r) }));

  return {
    updates: rows.filter((r) => r.row.kind === "goal_update").map((r) => r.item),
    recognition: rows.filter((r) => r.row.kind === "recognition").map((r) => r.item),
  };
}

/**
 * The same, for several people at once.
 *
 * A manager's page asked once per report — five reports, five round trips to a
 * database on another continent. One query, grouped here, and every subject
 * gets an entry even when they posted nothing, so a caller can index without
 * checking.
 */
export async function personActivityMany(
  subjectIds: string[],
  since?: string | null,
): Promise<Record<string, PersonActivity>> {
  const out: Record<string, PersonActivity> = {};
  for (const id of subjectIds) out[id] = { updates: [], recognition: [] };
  if (subjectIds.length === 0) return out;

  const supabase = createClient();
  let query = supabase
    .from("continuous_activities")
    .select(SELECT_MANY)
    .in("subject_id", subjectIds)
    .in("kind", ["goal_update", "recognition"])
    .or("is_private.is.null,is_private.eq.false")
    .order("created_at", { ascending: false })
    .limit(60 * Math.max(1, subjectIds.length));
  if (since) query = query.gte("created_at", since);

  const { data } = await query;
  for (const r of (data ?? []) as unknown as (Row & { subject_id: string })[]) {
    const bucket = out[r.subject_id];
    if (!bucket) continue;
    const item = toActivity(r);
    if (r.kind === "goal_update") bucket.updates.push(item);
    else if (r.kind === "recognition") bucket.recognition.push(item);
  }
  return out;
}
