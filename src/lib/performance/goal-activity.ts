/**
 * What somebody posted between reviews, shaped for a review.
 *
 * Goal updates and recognition were written to `continuous_activities` and read
 * by exactly one screen — the one they were written on. Nothing in the appraisal
 * flow queried the table, so an update posted in June had to be retyped from
 * memory at mid-year, and a manager reviewing somebody never saw a word of it.
 *
 * The reading lives in `person-activity.ts`; the shaping is here, where it can
 * be tested without a database.
 */

export interface GoalActivity {
  id: string;
  /** The objective it is about, when the author said. */
  goalId: string | null;
  title: string | null;
  body: string | null;
  authorName: string | null;
  createdAt: string;
}

export interface PersonActivity {
  /** Goal updates, newest first. */
  updates: GoalActivity[];
  /** Recognition somebody else gave them, newest first. */
  recognition: GoalActivity[];
}

/** Each goal's updates, gathered under it. */
export function byGoal(updates: GoalActivity[]): Map<string, GoalActivity[]> {
  const map = new Map<string, GoalActivity[]>();
  for (const u of updates) {
    if (!u.goalId) continue;
    const list = map.get(u.goalId) ?? [];
    list.push(u);
    map.set(u.goalId, list);
  }
  return map;
}

/**
 * Updates the author never tied to a goal.
 *
 * Worth showing rather than dropping: before the goal picker existed every
 * update was one of these, and they are still the record of what somebody did.
 */
export function unlinked(updates: GoalActivity[]): GoalActivity[] {
  return updates.filter((u) => !u.goalId);
}
