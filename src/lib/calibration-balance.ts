import type { BalanceBand, BalanceResult } from "@/types/calibration-panel";
import type { DistributionBand } from "@/types/calibration";

/**
 * Check a panel's band counts against the group's configured distribution and,
 * where a band exceeds its cap, suggest how to rebalance.
 *
 * The cap for a band is `floor(total × percent / 100)` — the spec's "meet or
 * below": e.g. with 20% Outstanding in a group of 10, at most 2 may sit there.
 * `target` is ordered top→bottom so suggestions move people to the next lower
 * bands that still have room.
 */
export function computeBalance(
  counts: Record<string, number>,
  target: DistributionBand[],
  total: number,
): BalanceResult {
  const bands: BalanceBand[] = target.map((t) => {
    const count = counts[t.label] ?? 0;
    const targetMax = Math.floor((total * t.percent) / 100);
    return {
      label: t.label,
      targetPercent: t.percent,
      targetMax,
      count,
      actualPercent: total ? Math.round((count / total) * 100) : 0,
      over: count > targetMax,
      room: targetMax - count,
    };
  });

  // Bands rated into labels that aren't in the target (reported, uncapped).
  for (const [label, count] of Object.entries(counts)) {
    if (!target.some((t) => t.label === label) && count > 0) {
      bands.push({
        label,
        targetPercent: null,
        targetMax: null,
        count,
        actualPercent: total ? Math.round((count / total) * 100) : 0,
        over: false,
        room: null,
      });
    }
  }

  const suggestions: string[] = [];
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (!b.over || b.targetMax == null) continue;
    const excess = b.count - b.targetMax;
    // Lower bands (further down the ordered list) with remaining room.
    const room = bands
      .slice(i + 1)
      .filter((x) => x.room != null && x.room > 0)
      .map((x) => `${x.label} (room ${x.room})`);
    suggestions.push(
      `${b.label} has ${b.count} (cap ${b.targetMax} at ${b.targetPercent}%). Move ${excess} down` +
        (room.length ? ` — e.g. to ${room.join(", ")}.` : "."),
    );
  }

  const rated = Object.values(counts).reduce((s, n) => s + n, 0);
  return {
    bands,
    suggestions,
    withinLimits: suggestions.length === 0,
    rated,
    total,
  };
}
