/**
 * Goal weights, with the type set aside.
 *
 * Objectives and development goals used to be weighted in separate pots: the
 * objectives shared a 100% between them, development goals were averaged flat
 * and given their own slice of the final score. A goal's type therefore decided
 * how much it was worth, which is not what a weight is for — and it left people
 * looking at a goal marked 35% while the total read 65%.
 *
 * Now every goal is weighted in the same 100% and counted the same way. The
 * type stays as a label on the goal; it no longer moves the score.
 */

export interface WeightedGoal {
  weight: number | null;
  manager_rating?: number | null;
}

/** What the goals' weights add up to. Should be 100. */
export function goalWeightTotal(goals: { weight: number | null }[]): number {
  return goals.reduce((sum, g) => sum + (g.weight ?? 0), 0);
}

export interface GoalsScore {
  /** Weighted mean of the rated goals, 1–5. Null when none is rated. */
  average: number | null;
  /** How many goals carry a rating. */
  rated: number;
}

/**
 * The goals component of the score.
 *
 * Weighted by each goal's own weight. Unrated goals are left out rather than
 * counted as zero — a manager part-way through rating should not see a score
 * that punishes the person for the goals not yet reached.
 *
 * When every rated goal happens to carry no weight the mean is plain, so a
 * cycle that never set weights still produces a score rather than a division
 * by zero.
 */
export function goalsScore(goals: WeightedGoal[]): GoalsScore {
  let weight = 0;
  let weighted = 0;
  let plain = 0;
  let rated = 0;

  for (const g of goals) {
    const rating = g.manager_rating;
    if (rating == null) continue;
    const w = g.weight ?? 0;
    weight += w;
    weighted += w * rating;
    plain += rating;
    rated += 1;
  }

  if (rated === 0) return { average: null, rated: 0 };
  return { average: weight > 0 ? weighted / weight : plain / rated, rated };
}
