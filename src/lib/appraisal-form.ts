import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { FormSection } from "@/types/form-section";
import type { StageRole } from "@/types/workflow";

export interface FormSectionView {
  key: string;
  type: string;
  title: string;
  instructions: string | null;
  weight: number;
  mandatory: boolean;
  editableByMe: boolean;
  evidenceRequired: boolean;
  allowAttachments: boolean;
  allowComments: boolean;
  conditional: boolean;
}

/**
 * The configured form sections for a live appraisal, filtered to those visible
 * to the signed-in viewer (per the section's role visibility). Returns [] when
 * the cycle's template defines no form, so the existing appraisal UI is the
 * source of truth and this renders as an additive outline only.
 */
export async function getAppraisalForm(appraisalId: string): Promise<FormSectionView[]> {
  const supabase = createClient();
  const { data: a } = await supabase
    .from("appraisals")
    .select("employee_id, manager_id, second_level_id, cycle_id")
    .eq("id", appraisalId)
    .maybeSingle();
  if (!a) return [];
  const ap = a as Record<string, unknown>;

  const { data: cyc } = await supabase
    .from("appraisal_cycles")
    .select("template_id")
    .eq("id", ap.cycle_id as string)
    .maybeSingle();
  const templateId = (cyc as Record<string, unknown> | null)?.template_id as string | undefined;
  if (!templateId) return [];

  const { data: tpl } = await supabase
    .from("cycle_templates")
    .select("config")
    .eq("id", templateId)
    .maybeSingle();
  const cfg = ((tpl as Record<string, unknown> | null)?.config as Record<string, unknown>) ?? {};
  const sections: FormSection[] = Array.isArray(cfg.sections) ? (cfg.sections as FormSection[]) : [];
  if (sections.length === 0) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await getAccess();
  const roles = new Set<StageRole>();
  if (user) {
    if (user.id === ap.employee_id) roles.add("employee");
    if (user.id === ap.manager_id) roles.add("line_manager");
    if (user.id === ap.second_level_id) roles.add("second_level");
  }
  if (access.isHr || access.isSystemAdmin || access.isAdmin) {
    roles.add("hr");
    roles.add("calibration");
  }
  const intersects = (list: StageRole[]) => list.length === 0 || list.some((r) => roles.has(r));

  return sections
    .filter((s) => intersects(s.visibleRoles))
    .map((s) => ({
      key: s.key,
      type: s.type,
      title: s.title,
      instructions: s.instructions,
      weight: s.weight,
      mandatory: s.mandatory,
      editableByMe: intersects(s.editableRoles),
      evidenceRequired: s.evidenceRequired,
      allowAttachments: s.allowAttachments,
      allowComments: s.allowComments,
      conditional: !!s.condition,
    }));
}
