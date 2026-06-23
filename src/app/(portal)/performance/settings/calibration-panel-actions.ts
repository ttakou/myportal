"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { getCalibrationSettings } from "@/lib/calibration";
import { getPanelData } from "@/lib/calibration-panel";
import { dispatchEvent } from "@/lib/notify-dispatch";
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

type DbClient = ReturnType<typeof createClient>;

interface ApRow {
  id: string;
  tenant_id: string;
  cycle_id: string;
  final_score: number | null;
  rating_label: string | null;
  employee_id: string | null;
  manager_id: string | null;
}

const AP_COLS = "id, tenant_id, cycle_id, final_score, rating_label, employee_id, manager_id";

/**
 * Write the final PGM rating for one appraisal: record a calibration adjustment,
 * set the score/label, move the gate to "final", and notify the employee and
 * line manager. Shared by single-finalise and bulk-confirm.
 */
async function applyFinalRating(
  supabase: DbClient,
  ap: ApRow,
  band: string,
  bands: RatingBand[],
  note: string | null,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const score = representativeScore(bands, band) ?? ap.final_score ?? null;

  await supabase.from("appraisal_calibration_adjustments").insert({
    tenant_id: ap.tenant_id,
    appraisal_id: ap.id,
    cycle_id: ap.cycle_id,
    previous_score: ap.final_score ?? null,
    previous_label: ap.rating_label ?? null,
    new_score: score,
    new_label: band,
    reason: `PGM final rating (${band})${note ? ` — ${note}` : ""}`,
    adjusted_by: userId,
  });

  const { error } = await supabase
    .from("appraisals")
    .update({ final_score: score, rating_label: band, calibration_gate: "final" })
    .eq("id", ap.id);
  if (error) return { ok: false, error: error.message };

  // Tell the employee and their line manager the rating is final.
  await dispatchEvent("rating_changed", {
    tenantId: ap.tenant_id,
    employeeIds: ap.employee_id ? [ap.employee_id] : [],
    managerIds: ap.manager_id ? [ap.manager_id] : [],
    placeholders: { rating: `${score ?? "—"}% (${band})` },
    url: "/performance/appraisals",
  });
  return { ok: true };
}

/** Band labels, top contributor → lowest, for a group (group override else default). */
async function bandOrderFor(supabase: DbClient, groupId: string): Promise<string[]> {
  const { data: grp } = await supabase
    .from("calibration_groups")
    .select("distribution")
    .eq("id", groupId)
    .maybeSingle();
  const grpDist = (grp as { distribution?: { label: string }[] } | null)?.distribution;
  const order = Array.isArray(grpDist) ? grpDist.map((d) => d.label) : [];
  if (order.length) return order;
  return (await getCalibrationSettings()).distribution.map((d) => d.label);
}

/**
 * PGM gate: finalise an appraisal. The PGM sees the panel rating and either
 * confirms it or supplies their own band (`pgmBand`) — the PGM's choice is the
 * final rating. The band maps to a representative score from the cycle's rating
 * bands, records a calibration adjustment, sets the rating, and moves the gate
 * to "final".
 */
export async function finalisePanelRating(
  groupId: string,
  appraisalId: string,
  pgmBand?: string | null,
  comment?: string | null,
): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR/PGM can finalise." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ap } = await supabase
    .from("appraisals")
    .select(AP_COLS)
    .eq("id", appraisalId)
    .maybeSingle();
  if (!ap) return { ok: false, error: "Appraisal not found." };
  const a = ap as unknown as ApRow;

  // Panel ratings for this person + the panel size — the PGM rating is only
  // available once the panel has finished this person.
  const [{ data: prs }, { count: memberCount }] = await Promise.all([
    supabase
      .from("calibration_panel_ratings")
      .select("band_label")
      .eq("group_id", groupId)
      .eq("appraisal_id", appraisalId),
    supabase
      .from("calibration_panel_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId),
  ]);
  const ratings = (prs ?? []) as { band_label: string }[];
  const members = memberCount ?? 0;
  if (members > 0 && ratings.length < members) {
    return { ok: false, error: "The panel hasn't finished rating this person yet." };
  }

  // Panel-agreed band = mode of member ratings, else the provisional label.
  const tally = new Map<string, number>();
  for (const r of ratings) tally.set(r.band_label, (tally.get(r.band_label) ?? 0) + 1);
  let panelBand: string | null = a.rating_label;
  let best = 0;
  for (const [b, n] of tally) if (n > best) { best = n; panelBand = b; }

  // The PGM's choice is final (no distribution cap); defaults to the panel band.
  const band = pgmBand?.trim() || panelBand;
  if (!band) return { ok: false, error: "No rating to finalise." };

  // Band order (top → bottom) — a downgrade below the panel band needs a comment.
  const order = await bandOrderFor(supabase, groupId);
  const rankOf = (l: string | null) => {
    const i = l ? order.indexOf(l) : -1;
    return i === -1 ? 99 : i;
  };
  const note = comment?.toString().trim() || null;
  if (panelBand != null && rankOf(band) > rankOf(panelBand) && !note) {
    return { ok: false, error: "A comment is required to rate below the panel's band." };
  }

  const { data: cyc } = await supabase
    .from("appraisal_cycles")
    .select("rating_bands")
    .eq("id", a.cycle_id)
    .maybeSingle();
  const bands = ((cyc as { rating_bands?: RatingBand[] } | null)?.rating_bands ?? []) as RatingBand[];

  const res = await applyFinalRating(supabase, a, band, bands, note, user?.id ?? null);
  if (!res.ok) return res;
  rev(groupId);
  return { ok: true };
}

/**
 * Bulk confirm: finalise every staff member still at the PGM gate at their
 * panel-agreed band (no override, no downgrade). Only available once the panel
 * has rated everyone — a one-tap way to accept the panel's outcome wholesale.
 */
export async function confirmAllPanelBands(groupId: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR/PGM can finalise." };
  const data = await getPanelData(groupId);
  if (!data) return { ok: false, error: "Group not found." };
  if (!data.panelComplete) {
    return { ok: false, error: "The panel hasn't finished rating everyone yet." };
  }
  const pending = data.staff.filter((s) => s.gate === "pgm" && s.panelBand);
  if (pending.length === 0) return { ok: false, error: "Nothing left to confirm." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ids = pending.map((s) => s.appraisalId);
  const { data: apsRaw } = await supabase.from("appraisals").select(AP_COLS).in("id", ids);
  const aps = new Map(((apsRaw ?? []) as unknown as ApRow[]).map((a) => [a.id, a]));

  // All staff share the cycle; read its rating bands once.
  const cycleId = (apsRaw ?? [])[0] ? (apsRaw as unknown as ApRow[])[0].cycle_id : null;
  let bands: RatingBand[] = [];
  if (cycleId) {
    const { data: cyc } = await supabase
      .from("appraisal_cycles")
      .select("rating_bands")
      .eq("id", cycleId)
      .maybeSingle();
    bands = ((cyc as { rating_bands?: RatingBand[] } | null)?.rating_bands ?? []) as RatingBand[];
  }

  let confirmed = 0;
  for (const s of pending) {
    const a = aps.get(s.appraisalId);
    if (!a || !s.panelBand) continue;
    const res = await applyFinalRating(supabase, a, s.panelBand, bands, null, user?.id ?? null);
    if (res.ok) confirmed += 1;
  }
  rev(groupId);
  return confirmed > 0 ? { ok: true } : { ok: false, error: "Nothing was confirmed." };
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
