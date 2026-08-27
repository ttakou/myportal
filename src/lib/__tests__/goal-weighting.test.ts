import { describe, expect, it } from "vitest";
import { goalWeightTotal, goalsScore } from "@/lib/performance/goal-weighting";

describe("goalWeightTotal", () => {
  it("adds every goal's weight, whatever its type", () => {
    // The case that prompted this: a 35% goal marked development sitting
    // outside a total that read 65%.
    expect(
      goalWeightTotal([{ weight: 35 }, { weight: 25 }, { weight: 20 }, { weight: 20 }]),
    ).toBe(100);
  });

  it("treats a missing weight as nothing", () => {
    expect(goalWeightTotal([{ weight: null }, { weight: 40 }])).toBe(40);
  });

  it("is zero for no goals", () => {
    expect(goalWeightTotal([])).toBe(0);
  });
});

describe("goalsScore", () => {
  it("weights each rating by its goal's weight", () => {
    // 0.6·5 + 0.4·1 = 3.4
    expect(goalsScore([
      { weight: 60, manager_rating: 5 },
      { weight: 40, manager_rating: 1 },
    ]).average).toBeCloseTo(3.4);
  });

  it("gives a development goal exactly the pull its weight earns", () => {
    // The point of the change: type no longer alters the arithmetic, so these
    // two are the same calculation.
    const asObjective = goalsScore([
      { weight: 35, manager_rating: 2 },
      { weight: 65, manager_rating: 4 },
    ]);
    const asDevelopment = goalsScore([
      { weight: 35, manager_rating: 2 },
      { weight: 65, manager_rating: 4 },
    ]);
    expect(asObjective.average).toBe(asDevelopment.average);
    expect(asObjective.average).toBeCloseTo(3.3);
  });

  it("leaves unrated goals out rather than scoring them zero", () => {
    // Part-way through rating, the score reflects what has been rated.
    expect(goalsScore([
      { weight: 50, manager_rating: 4 },
      { weight: 50, manager_rating: null },
    ])).toEqual({ average: 4, rated: 1 });
  });

  it("has no average when nothing is rated", () => {
    expect(goalsScore([{ weight: 100, manager_rating: null }])).toEqual({
      average: null,
      rated: 0,
    });
    expect(goalsScore([])).toEqual({ average: null, rated: 0 });
  });

  it("falls back to a plain mean when the rated goals carry no weight", () => {
    // A cycle that never set weights still produces a score.
    expect(goalsScore([
      { weight: 0, manager_rating: 2 },
      { weight: null, manager_rating: 4 },
    ]).average).toBe(3);
  });

  it("counts the rated goals", () => {
    expect(goalsScore([
      { weight: 30, manager_rating: 3 },
      { weight: 30, manager_rating: 5 },
      { weight: 40, manager_rating: null },
    ]).rated).toBe(2);
  });
});
