import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCalibrationSettings } from "@/lib/calibration";
import type { Confidentiality, DistributionBand } from "@/types/calibration";

export interface CalibrationRow {
  appraisalId: string;
  name: string;
  preliminary: number | null;
  adjusted: number | null;
  delta: number | null;
  label: string | null;
  reason: string | null;
  potential: number | null;
}

/** Performance tier (1 low / 2 medium / 3 high) from a 0–100 score. */
export function perfTier(score: number | null): number | null {
  if (score == null) return null;
  if (score >= 80) return 3;
  if (score >= 60) return 2;
  return 1;
}

export interface DistributionBucket {
  label: string;
  count: number;
  actualPercent: number;
  targetPercent: number | null;
}

export interface NineBoxCell {
  count: number;
  names: string[];
}

export interface CalibrationSession {
  rows: CalibrationRow[];
  distribution: DistributionBucket[];
  target: DistributionBand[];
  confidentiality: Confidentiality;
  stats: { total: number; adjusted: number; average: number | null; deviation: number | null };
  /** 3×3: rows potential High→Low, cols performance Low→High. */
  nineBox: NineBoxCell[][];
}

function nameFrom(embed: unknown): string {
  const o = Array.isArray(embed) ? embed[0] : embed;
  return (o as { full_name?: string } | null)?.full_name ?? "Unknown";
}

/** Build the calibration session for a cycle: preliminary vs adjusted ratings,
 *  distribution vs target, adjustment reasons and simple bias indicators. */
export async function getCalibrationSession(cycleId: string): Promise<CalibrationSession> {
  const supabase = createClient();
  const settings = await getCalibrationSettings();

  const [{ data: aps }, { data: adjs }] = await Promise.all([
    supabase
      .from("appraisals")
      .select("id, final_score, rating_label, potential_rating, employee:profiles!employee_id(full_name)")
      .eq("cycle_id", cycleId)
      .not("final_score", "is", null),
    supabase
      .from("appraisal_calibration_adjustments")
      .select("appraisal_id, previous_score, new_score, reason, created_at")
      .eq("cycle_id", cycleId)
      .order("created_at", { ascending: true }),
  ]);

  // Group adjustments per appraisal: preliminary = first previous_score; reason = last.
  const firstAdj = new Map<string, number | null>();
  const lastReason = new Map<string, string | null>();
  const adjustedSet = new Set<string>();
  for (const r of (adjs ?? []) as Record<string, unknown>[]) {
    const id = String(r.appraisal_id);
    adjustedSet.add(id);
    if (!firstAdj.has(id)) firstAdj.set(id, (r.previous_score as number | null) ?? null);
    if (r.reason) lastReason.set(id, r.reason as string);
  }

  const anonymize = settings.confidentiality.anonymizeInCharts;
  const rows: CalibrationRow[] = ((aps ?? []) as Record<string, unknown>[]).map((a, i) => {
    const id = String(a.id);
    const adjusted = (a.final_score as number | null) ?? null;
    const preliminary = firstAdj.has(id) ? firstAdj.get(id)! : adjusted;
    return {
      appraisalId: id,
      name: anonymize ? `Employee ${i + 1}` : nameFrom(a.employee),
      preliminary,
      adjusted,
      delta: preliminary != null && adjusted != null ? Math.round((adjusted - preliminary) * 10) / 10 : null,
      label: (a.rating_label as string | null) ?? null,
      reason: settings.confidentiality.showAdjustmentReasons ? lastReason.get(id) ?? null : null,
      potential: (a.potential_rating as number | null) ?? null,
    };
  });

  // 9-box: rows = potential High(3)→Low(1), cols = performance Low(1)→High(3).
  const nineBox: NineBoxCell[][] = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => ({ count: 0, names: [] as string[] })),
  );
  for (const r of rows) {
    const p = r.potential;
    const pf = perfTier(r.adjusted);
    if (!p || !pf) continue;
    const cell = nineBox[3 - p][pf - 1]; // potential 3→row0; perf 1→col0
    cell.count += 1;
    cell.names.push(r.name);
  }

  // Actual distribution by rating label.
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.label ?? "Unrated";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = rows.length;
  const targetByLabel = new Map(settings.distribution.map((b) => [b.label.toLowerCase(), b.percent]));
  const labels = new Set<string>([...counts.keys(), ...settings.distribution.map((b) => b.label)]);
  const distribution: DistributionBucket[] = [...labels].map((label) => {
    const count = counts.get(label) ?? 0;
    return {
      label,
      count,
      actualPercent: total ? Math.round((count / total) * 100) : 0,
      targetPercent: targetByLabel.has(label.toLowerCase()) ? targetByLabel.get(label.toLowerCase())! : null,
    };
  });

  const scores = rows.map((r) => r.adjusted).filter((s): s is number => s != null);
  const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const deviation = settings.distribution.length
    ? distribution
        .filter((d) => d.targetPercent != null)
        .reduce((sum, d) => sum + Math.abs(d.actualPercent - (d.targetPercent ?? 0)), 0)
    : null;

  return {
    rows,
    distribution,
    target: settings.distribution,
    confidentiality: settings.confidentiality,
    stats: { total, adjusted: adjustedSet.size, average, deviation },
    nineBox,
  };
}
