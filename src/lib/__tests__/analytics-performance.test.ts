import { describe, expect, it } from "vitest";
import {
  aggregatePerformance,
  ratingDistribution,
  type PerfAppraisalRow,
  type PerfCycleRow,
} from "@/lib/analytics";

describe("ratingDistribution", () => {
  it("buckets ratings into 1–5", () => {
    expect(ratingDistribution([1, 2, 2, 3, 5]).map((b) => b.count)).toEqual([1, 2, 1, 0, 1]);
  });

  it("is all zeros for no ratings", () => {
    expect(ratingDistribution([]).map((b) => b.count)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("aggregatePerformance", () => {
  it("returns an empty shape when there are no cycles", () => {
    const m = aggregatePerformance([], []);
    expect(m.cycle).toBeNull();
    expect(m).toMatchObject({ total: 0, completed: 0, completionPct: 0, pending: 0, avgRating: null });
    expect(m.byDept).toEqual([]);
    expect(m.trend).toEqual([]);
  });

  it("uses the active cycle as headline even when it isn't the newest", () => {
    const cycles: PerfCycleRow[] = [
      { id: "d", name: "2027 draft", year: 2027, status: "draft" },
      { id: "a", name: "2026", year: 2026, status: "active" },
    ];
    const m = aggregatePerformance(cycles, []);
    expect(m.cycle).toEqual({ name: "2026", year: 2026, status: "active" });
  });

  it("computes completion, pending, average and distribution for the headline cycle", () => {
    const cycles: PerfCycleRow[] = [
      { id: "c2026", name: "2026", year: 2026, status: "active" },
      { id: "c2025", name: "2025", year: 2025, status: "closed" },
    ];
    const appraisals: PerfAppraisalRow[] = [
      { cycle_id: "c2026", status: "completed", overall_rating: 4, department: "Eng" },
      { cycle_id: "c2026", status: "completed", overall_rating: 2, department: "Eng" },
      { cycle_id: "c2026", status: "pending_manager_review", overall_rating: null, department: "Ops" },
      { cycle_id: "c2026", status: "closed", overall_rating: 5, department: null },
      { cycle_id: "c2025", status: "completed", overall_rating: 3, department: "Eng" },
    ];
    const m = aggregatePerformance(cycles, appraisals);

    expect(m.total).toBe(4);
    expect(m.completed).toBe(3); // completed, completed, closed
    expect(m.completionPct).toBe(75);
    expect(m.pending).toBe(1);
    expect(m.avgRating).toBe(3.67); // (4+2+5)/3
    expect(m.distribution.map((b) => b.count)).toEqual([0, 1, 0, 1, 1]);
  });

  it("breaks down average rating by department (headline cycle only, busiest first)", () => {
    const cycles: PerfCycleRow[] = [{ id: "c", name: "2026", year: 2026, status: "active" }];
    const appraisals: PerfAppraisalRow[] = [
      { cycle_id: "c", status: "completed", overall_rating: 4, department: "Eng" },
      { cycle_id: "c", status: "completed", overall_rating: 2, department: "Eng" },
      { cycle_id: "c", status: "closed", overall_rating: 5, department: null },
      { cycle_id: "c", status: "pending_manager_review", overall_rating: null, department: "Ops" },
    ];
    expect(aggregatePerformance(cycles, appraisals).byDept).toEqual([
      { department: "Eng", count: 2, avg: 3 },
      { department: "Unassigned", count: 1, avg: 5 },
    ]);
  });

  it("builds a year-over-year trend oldest→newest", () => {
    const cycles: PerfCycleRow[] = [
      { id: "c2026", name: "2026", year: 2026, status: "active" },
      { id: "c2025", name: "2025", year: 2025, status: "closed" },
    ];
    const appraisals: PerfAppraisalRow[] = [
      { cycle_id: "c2026", status: "completed", overall_rating: 4, department: null },
      { cycle_id: "c2025", status: "completed", overall_rating: 3, department: null },
    ];
    expect(aggregatePerformance(cycles, appraisals).trend).toEqual([
      { year: 2025, avgRating: 3, completionPct: 100 },
      { year: 2026, avgRating: 4, completionPct: 100 },
    ]);
  });
});
