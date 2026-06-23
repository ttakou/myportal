"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import { CALIBRATION_GATES, type CalibrationGate } from "@/types/calibration-panel";
import type { DistributionBand } from "@/types/calibration";
import type { RatingBand } from "@/types/appraisal";

/** A representative 0–100 score for a band label, from the cycle's rating bands
 *  (midpoint of the band's range), so the PGM gate can set a concrete score. */
function representativeScore(bands: RatingBand[], label: string): number | null {
  const sorted = [...(bands ?? [])].sort((a, b) => a.min - b.min);
  const i = sorted.findIndex((b) => b.label === label);
  if (i === -1) return null;
  const lower = sorted[i].min;
  const upper = i + 1 < sorted.length ? sorted[i + 1].min : 100;
  return Math.max(0, Math.min(100, Math.round((lower + upper) / 2)));
}

async function ensureHr() {
  const access = await getAccess();
  return access.isHr || access.isSystemAdmin || access.isAdmin;
}

function rev(groupId: string) {
  revalidatePath(`/performance/calibration/${groupId}`);
  revalidatePath("/performance/calibration");
}

/** HR sets the panel membership for a group (replaces the set). */
export async function setPanelMembers(groupId: string, memberIds: string[]): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can set the panel." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  await supabase.from("calibration_panel_members").delete().eq("group_id", groupId);
  const rows = [...new Set(memberIds)].map((member_id) => ({
    tenant_id: tenant.id,
    group_id: groupId,
    member_id,
  }));
  if (rows.length) {
    const { error } = await supabase.from("calibration_panel_members").insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  rev(groupId);
  return { ok: true };
}

/** A panel member (or HR) records their rating + comment for one staff member. */
export async function submitPanelRating(input: {
  groupId: string;
  appraisalId: string;
  bandLabel: string;
  comment?: string | null;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!input.bandLabel?.trim()) return { ok: false, error: "Pick a rating band." };

  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("calibration_panel_ratings").upsert(
    {
      tenant_id: tenant.id,
      group_id: input.groupId,
      appraisal_id: input.appraisalId,
      member_id: user.id,
      band_label: input.bandLabel.trim(),
      comment: input.comment?.toString().trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id,appraisal_id,member_id" },
  );
  if (error) return { ok: false, error: error.message };
  rev(input.groupId);
  return { ok: true };
}

/** HR sets the per-band target percentages for a group, at rating time. */
export async function setGroupDistribution(
  groupId: string,
  bands: DistributionBand[],
): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can set the distribution." };
  const clean = (bands ?? [])
    .filter((b) => b.label?.trim())
    .map((b) => ({ label: b.label.trim(), percent: Math.max(0, Math.min(100, Math.round(b.percent || 0))) }));
  const supabase = createClient();
  const { error } = await supabase
    .from("calibration_groups")
    .update({ distribution: clean, updated_at: new Date().toISOString() })
    .eq("id", groupId);
  if (error) return { ok: false, error: error.message };
  rev(groupId);
  return { ok: true };
}

/**
 * PGM gate: finalise an appraisal at its panel-agreed band. Maps the band to a
 * representative score from the cycle's rating bands, records a calibration
 * adjustment, sets the rating, and moves the gate to "final".
 */
export async function finalisePanelRating(groupId: string, appraisalId: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR/PGM can finalise." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ap } = await supabase
    .from("appraisals")
    .select("id, tenant_id, cycle_id, final_score, rating_label")
    .eq("id", appraisalId)
    .maybeSingle();
  if (!ap) return { ok: false, error: "Appraisal not found." };
  const a = ap as Record<string, unknown>;

  // Panel-agreed band = mode of member ratings, else the provisional label.
  const { data: prs } = await supabase
    .from("calibration_panel_ratings")
    .select("band_label")
    .eq("group_id", groupId)
    .eq("appraisal_id", appraisalId);
  const tally = new Map<string, number>();
  for (const r of (prs ?? []) as { band_label: string }[]) {
    tally.set(r.band_label, (tally.get(r.band_label) ?? 0) + 1);
  }
  let band: string | null = (a.rating_label as string | null) ?? null;
  let best = 0;
  for (const [b, n] of tally) if (n > best) { best = n; band = b; }
  if (!band) return { ok: false, error: "No panel rating to finalise." };

  const { data: cyc } = await supabase
    .from("appraisal_cycles")
    .select("rating_bands")
    .eq("id", a.cycle_id as string)
    .maybeSingle();
  const bands = ((cyc as { rating_bands?: RatingBand[] } | null)?.rating_bands ?? []) as RatingBand[];
  const score = representativeScore(bands, band) ?? (a.final_score as number | null) ?? null;

  await supabase.from("appraisal_calibration_adjustments").insert({
    tenant_id: a.tenant_id,
    appraisal_id: appraisalId,
    cycle_id: a.cycle_id,
    previous_score: a.final_score ?? null,
    previous_label: a.rating_label ?? null,
    new_score: score,
    new_label: band,
    reason: `PGM final rating (panel: ${band})`,
    adjusted_by: user?.id ?? null,
  });

  const { error } = await supabase
    .from("appraisals")
    .update({ final_score: score, rating_label: band, calibration_gate: "final" })
    .eq("id", appraisalId);
  if (error) return { ok: false, error: error.message };
  rev(groupId);
  return { ok: true };
}

/** Move an appraisal between calibration gates (HR). */
export async function setCalibrationGate(
  appraisalId: string,
  gate: CalibrationGate,
  groupId: string,
): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can advance gates." };
  if (!CALIBRATION_GATES.includes(gate)) return { ok: false, error: "Unknown gate." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ calibration_gate: gate })
    .eq("id", appraisalId);
  if (error) return { ok: false, error: error.message };
  rev(groupId);
  return { ok: true };
}
