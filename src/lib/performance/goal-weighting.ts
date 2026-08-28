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

/**
 * How far through the whole plan somebody is, weighted by each goal.
 *
 * A goal at 100% that carries 5% of the plan is not the same achievement as one
 * at 50% carrying 40%, so a plain average would flatter the wrong person.
 * Goals with no percentage yet are left out rather than counted as zero: at the
 * start of a review everything is unanswered, and a plan reading 0% because
 * nobody has typed in it says nothing.
 */
export function overallProgress(
  goals: { weight: number | null; progress_percent?: number | null }[],
): { percent: number | null; answered: number; of: number } {
  let weight = 0;
  let weighted = 0;
  let plain = 0;
  let answered = 0;

  for (const g of goals) {
    const p = g.progress_percent;
    if (p == null) continue;
    const w = g.weight ?? 0;
    weight += w;
    weighted += w * p;
    plain += p;
    answered += 1;
  }

  if (answered === 0) return { percent: null, answered: 0, of: goals.length };
  const raw = weight > 0 ? weighted / weight : plain / answered;
  return { percent: Math.round(raw), answered, of: goals.length };
}

export interface GoalRuleConfig {
  minGoals: number;
  maxGoals: number;
  minGoalWeight: number;
  maxGoalWeight: number;
  goalWeightsTotal100: boolean;
}

/**
 * Validate the goals against the tenant's configured rules.
 *
 * Every goal is counted, whatever its type. Development goals used to be
 * excluded from the count and from the 100%, so a person could hold a goal
 * weighted 35% while the total read 65% with nothing to say where the rest had
 * gone. A weight means the same thing on every goal now.
 */
export function goalWeightError(
  goals: { weight: number | null; kind: string }[],
  config?: GoalRuleConfig,
): string | null {
  const min = config?.minGoals ?? 1;
  if (goals.length < Math.max(1, min))
    return `Add at least ${Math.max(1, min)} goal${min === 1 ? "" : "s"} before submitting.`;
  if (config && goals.length > config.maxGoals)
    return `You can set at most ${config.maxGoals} goal${config.maxGoals === 1 ? "" : "s"}.`;
  if (config) {
    for (const g of goals) {
      const w = g.weight ?? 0;
      if (w < config.minGoalWeight || w > config.maxGoalWeight)
        return `Each goal's weight must be between ${config.minGoalWeight}% and ${config.maxGoalWeight}%.`;
    }
  }
  if (!config || config.goalWeightsTotal100) {
    const sum = goalWeightTotal(goals);
    if (sum !== 100) return `Goal weights must total 100% — they currently total ${sum}%.`;
  }
  return null;
}
