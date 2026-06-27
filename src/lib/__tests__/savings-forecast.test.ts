import { describe, it, expect } from "vitest";
import {
  futureValue,
  requiredContribution,
  monthsToTarget,
  monthsBetween,
} from "@/lib/savings-forecast";

const RATE = 0.07 / 12; // 7%/yr monthly

describe("futureValue", () => {
  it("returns the balance for n<=0", () => {
    expect(futureValue(1000, 500, RATE, 0)).toBe(1000);
    expect(futureValue(1000, 500, RATE, -5)).toBe(1000);
  });

  it("is linear with zero interest", () => {
    expect(futureValue(1000, 500, 0, 12)).toBe(1000 + 500 * 12);
  });

  it("compounds the balance and the contribution annuity", () => {
    // 0 balance, 50k/month, 12 months at 7%/yr → contributions 600k + ~19.6k interest
    const fv = futureValue(0, 50_000, RATE, 12);
    expect(Math.round(fv)).toBe(619_629);
    expect(fv).toBeGreaterThan(600_000); // more than bare contributions
  });

  it("grows a lump sum with interest only", () => {
    const fv = futureValue(1_000_000, 0, RATE, 12);
    expect(Math.round(fv)).toBe(Math.round(1_000_000 * Math.pow(1 + RATE, 12)));
  });
});

describe("requiredContribution", () => {
  it("inverts futureValue — the required P actually reaches the target", () => {
    const T = 5_000_000;
    const P = requiredContribution(200_000, T, RATE, 24);
    expect(Math.round(futureValue(200_000, P, RATE, 24))).toBe(T);
  });

  it("matches the simple case with zero interest", () => {
    expect(requiredContribution(0, 1200, 0, 12)).toBe(100);
  });

  it("is Infinity when there is no time", () => {
    expect(requiredContribution(0, 1000, RATE, 0)).toBe(Infinity);
  });
});

describe("monthsToTarget", () => {
  it("is 0 when already at/over target", () => {
    expect(monthsToTarget(1000, 1000, RATE, 100)).toBe(0);
    expect(monthsToTarget(2000, 1000, RATE, 100)).toBe(0);
  });

  it("never reaches with no contribution and no interest", () => {
    expect(monthsToTarget(0, 1000, 0, 0)).toBe(Infinity);
  });

  it("computes whole months with zero interest", () => {
    expect(monthsToTarget(0, 1000, 0, 100)).toBe(10);
    expect(monthsToTarget(0, 1050, 0, 100)).toBe(11); // ceil
  });

  it("agrees with futureValue (the balance at n months clears the target)", () => {
    const n = monthsToTarget(100_000, 2_000_000, RATE, 75_000);
    expect(n).toBeGreaterThan(0);
    expect(futureValue(100_000, 75_000, RATE, n)).toBeGreaterThanOrEqual(2_000_000);
    expect(futureValue(100_000, 75_000, RATE, n - 1)).toBeLessThan(2_000_000);
  });

  it("reaches a target on interest alone", () => {
    const n = monthsToTarget(1_000_000, 2_000_000, RATE, 0);
    expect(Number.isFinite(n)).toBe(true);
    expect(futureValue(1_000_000, 0, RATE, n)).toBeGreaterThanOrEqual(2_000_000);
  });
});

describe("monthsBetween", () => {
  it("counts whole months forward", () => {
    expect(monthsBetween(2026, 6, "2027-06-01")).toBe(12);
    expect(monthsBetween(2026, 6, "2026-09-15")).toBe(3);
  });

  it("never goes negative for past dates", () => {
    expect(monthsBetween(2026, 6, "2025-06-01")).toBe(0);
  });

  it("returns 0 for malformed input", () => {
    expect(monthsBetween(2026, 6, "not-a-date")).toBe(0);
  });
});
