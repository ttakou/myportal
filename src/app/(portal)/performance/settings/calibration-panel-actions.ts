"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import { CALIBRATION_GATES, type CalibrationGate } from "@/types/calibration-panel";

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
