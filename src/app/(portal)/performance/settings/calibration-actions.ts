"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { dispatchEvent } from "@/lib/notify-dispatch";
import type { ActionResult } from "@/types/actions";
import {
  GROUP_BYS,
  type CalibrationSettings,
  type GroupBy,
  type GroupStatus,
} from "@/types/calibration";

async function ensureHr() {
  const access = await getAccess();
  return access.isHr || access.isSystemAdmin || access.isAdmin;
}

const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));

export async function saveCalibrationSettings(input: CalibrationSettings): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can change calibration settings." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const fields = {
    mode: input.mode === "forced" ? "forced" : "guidance",
    distribution: (input.distribution ?? [])
      .filter((b) => b.label?.trim())
      .map((b) => ({ label: b.label.trim(), percent: clampPct(b.percent) })),
    adjustment_limit: Math.max(0, Math.min(5, Math.round(input.adjustmentLimit || 0))),
    require_justification: !!input.requireJustification,
    approval_role: input.approvalRole || "hr",
    default_group_by: GROUP_BYS.includes(input.defaultGroupBy) ? input.defaultGroupBy : "department",
    confidentiality: input.confidentiality,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("calibration_settings")
    .upsert({ tenant_id: tenant.id, ...fields }, { onConflict: "tenant_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/calibration");
  return { ok: true };
}

export async function createCalibrationGroup(input: {
  cycleId: string | null;
  name: string;
  groupBy: GroupBy;
  groupValue?: string | null;
}): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage calibration groups." };
  if (!input.name?.trim()) return { ok: false, error: "Give the group a name." };
  const groupBy: GroupBy = GROUP_BYS.includes(input.groupBy) ? input.groupBy : "department";

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  // Calibration is the once-a-year, end-of-year step that turns line managers'
  // provisional scores into final ratings — so it can only run against a cycle
  // that has reached its year-end close. No free-floating (cycle-less) groups,
  // and not while the cycle is still a draft or running.
  if (!input.cycleId) {
    return { ok: false, error: "Pick the appraisal cycle to calibrate." };
  }
  const { data: cycle } = await supabase
    .from("appraisal_cycles")
    .select("status")
    .eq("id", input.cycleId)
    .maybeSingle();
  if (!cycle) return { ok: false, error: "Cycle not found." };
  if ((cycle as { status?: string }).status !== "closed") {
    return {
      ok: false,
      error: "Calibration opens only after the cycle is closed for the year. Close the cycle first.",
    };
  }

  const { error } = await supabase.from("calibration_groups").insert({
    tenant_id: tenant.id,
    cycle_id: input.cycleId || null,
    name: input.name.trim(),
    group_by: groupBy,
    group_value: input.groupValue?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/calibration");
  return { ok: true };
}

export async function setCalibrationGroupStatus(
  id: string,
  status: GroupStatus,
): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage calibration groups." };
  const supabase = createClient();
  const { error } = await supabase
    .from("calibration_groups")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/calibration");
  return { ok: true };
}

/** Set an appraisal's potential rating (1 low … 3 high) for the 9-box. */
export async function setPotentialRating(
  appraisalId: string,
  value: number | null,
): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can set potential." };
  const v = value == null ? null : Math.max(1, Math.min(3, Math.round(value)));
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ potential_rating: v })
    .eq("id", appraisalId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/calibration");
  return { ok: true };
}

/**
 * Release ratings: from the admin centre, the PGM/HR triggers the finalised
 * ratings for a cycle to be sent to each employee and their line manager. Fires
 * the configurable `rating_changed` notification per finalised appraisal (those
 * with a final score and label), so delivery follows the tenant's rules.
 */
export async function sendRatingsToStaff(
  cycleId: string,
): Promise<ActionResult & { sent?: number }> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR/PGM can release ratings." };
  if (!cycleId) return { ok: false, error: "Pick a cycle." };

  const supabase = createClient();
  // Only release ratings the PGM has signed off (calibration_gate = 'final').
  // A line-manager's provisional score is not a releasable final rating.
  const { data: aps, error } = await supabase
    .from("appraisals")
    .select("id, tenant_id, employee_id, manager_id, final_score, rating_label")
    .eq("cycle_id", cycleId)
    .eq("calibration_gate", "final")
    .not("final_score", "is", null)
    .not("rating_label", "is", null);
  if (error) return { ok: false, error: error.message };

  const rows = (aps ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return {
      ok: false,
      error: "No PGM-signed-off ratings to release for this cycle. Finalise them in calibration first.",
    };
  }

  // Mark these ratings as released — this is what unlocks the score for the
  // employee's own view. Until now they saw comments/remarks only.
  const releasedAt = new Date().toISOString();
  const { error: relErr } = await supabase
    .from("appraisals")
    .update({ rating_released_at: releasedAt })
    .in("id", rows.map((r) => String(r.id)));
  if (relErr) return { ok: false, error: relErr.message };

  let sent = 0;
  for (const a of rows) {
    await dispatchEvent("rating_changed", {
      tenantId: String(a.tenant_id),
      employeeIds: a.employee_id ? [String(a.employee_id)] : [],
      managerIds: a.manager_id ? [String(a.manager_id)] : [],
      placeholders: { rating: `${a.final_score ?? "—"}% (${a.rating_label ?? "—"})` },
      url: "/performance/appraisals",
    });
    sent += 1;
  }
  revalidatePath("/performance/settings/calibration");
  return { ok: true, sent };
}

export async function deleteCalibrationGroup(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage calibration groups." };
  const supabase = createClient();
  const { error } = await supabase.from("calibration_groups").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/calibration");
  return { ok: true };
}
