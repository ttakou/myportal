/**
 * Pure time-value-of-money helpers for the savings forecast/planner.
 *
 * Model: opening balance B, level monthly contribution P, monthly rate r
 * (annualRate / 12), compounded monthly. Kept framework-free and side-effect
 * free so they're unit-tested directly.
 */

/** Future value after n whole months. */
export function futureValue(B: number, P: number, r: number, n: number): number {
  if (n <= 0) return B;
  if (r === 0) return B + P * n;
  const g = Math.pow(1 + r, n);
  return B * g + P * ((g - 1) / r);
}

/** Monthly contribution needed to reach target T in n months. */
export function requiredContribution(B: number, T: number, r: number, n: number): number {
  if (n <= 0) return Infinity;
  if (r === 0) return (T - B) / n;
  const g = Math.pow(1 + r, n);
  return (T - B * g) / ((g - 1) / r);
}

/** Whole months to grow from B to T given contribution P (Infinity if never). */
export function monthsToTarget(B: number, T: number, r: number, P: number): number {
  if (T <= B) return 0;
  if (r === 0) return P > 0 ? Math.ceil((T - B) / P) : Infinity;
  const denom = B * r + P;
  const numer = T * r + P;
  if (denom <= 0 || numer <= 0) return Infinity;
  const n = Math.log(numer / denom) / Math.log(1 + r);
  return n > 0 && Number.isFinite(n) ? Math.ceil(n) : Infinity;
}

/** Whole months from (fromYear, fromMonth=1..12) to the YYYY-MM in `toIso`, never negative. */
export function monthsBetween(fromYear: number, fromMonth: number, toIso: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(toIso);
  if (!m) return 0;
  const ty = Number(m[1]);
  const tm = Number(m[2]);
  return Math.max(0, (ty - fromYear) * 12 + (tm - fromMonth));
}
