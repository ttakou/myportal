import { describe, expect, it } from "vitest";
import { computeBalance } from "@/lib/calibration-balance";

const target = [
  { label: "Outstanding", percent: 20 },
  { label: "Strong", percent: 30 },
  { label: "Meets", percent: 50 },
];

describe("computeBalance", () => {
  it("is within limits when each band is at or below its cap", () => {
    const r = computeBalance({ Outstanding: 2, Strong: 3, Meets: 5 }, target, 10);
    expect(r.withinLimits).toBe(true);
    expect(r.suggestions).toEqual([]);
    expect(r.bands.find((b) => b.label === "Outstanding")?.targetMax).toBe(2);
  });

  it("flags an over-cap band and suggests moving the excess down", () => {
    const r = computeBalance({ Outstanding: 4, Strong: 2, Meets: 4 }, target, 10);
    expect(r.withinLimits).toBe(false);
    expect(r.bands.find((b) => b.label === "Outstanding")?.over).toBe(true);
    expect(r.suggestions[0]).toContain("Outstanding has 4 (cap 2");
    expect(r.suggestions[0]).toContain("Move 2 down");
    // Strong has room (cap 3, count 2) so it should be suggested.
    expect(r.suggestions[0]).toContain("Strong (room 1)");
  });

  it("uses floor for the cap (20% of 9 → 1)", () => {
    const r = computeBalance({ Outstanding: 2 }, target, 9);
    expect(r.bands.find((b) => b.label === "Outstanding")?.targetMax).toBe(1);
    expect(r.withinLimits).toBe(false);
  });

  it("reports bands outside the target without capping them", () => {
    const r = computeBalance({ Outstanding: 1, Unrated: 3 }, target, 10);
    const extra = r.bands.find((b) => b.label === "Unrated");
    expect(extra?.targetMax).toBeNull();
    expect(extra?.over).toBe(false);
  });
});
