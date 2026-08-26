import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { HOUSE_PHASES, type WorkflowStage } from "@/types/workflow";

/** The tenant's standard process, by name. One per tenant. */
export const HOUSE_TEMPLATE_NAME = "Standard five-phase appraisal";

const HOUSE_TEMPLATE_DESCRIPTION =
  "Goals Setting, Mid Year Review, Final Review, Annual Calibration, Final Appraisal. " +
  "Each phase the employee takes part in runs: employee submits, manager reviews and " +
  "comments, employee signs off, manager signs off.";

/**
 * Find or create the tenant's five-phase template, returning its id.
 *
 * Every cycle carries the five phases, so a cycle created without a template is
 * a cycle with no process at all — which is how the phases came to be created as
 * separate cycles in the first place. Attached at creation rather than left for
 * somebody to remember afterwards.
 *
 * Idempotent: the template is found by name, and its stages are refreshed from
 * HOUSE_PHASES so a template written by an older release cannot go stale. A
 * workflow edited by hand in the designer keeps a different name and is left
 * alone.
 */
export async function ensureHousePhaseTemplate(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const stages = HOUSE_PHASES.map((s) => ({ ...s }));

  const { data: existing } = await supabase
    .from("cycle_templates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", HOUSE_TEMPLATE_NAME)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("cycle_templates")
      .update({ config: { stages }, is_active: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data: created, error } = await supabase
    .from("cycle_templates")
    .insert({
      tenant_id: tenantId,
      name: HOUSE_TEMPLATE_NAME,
      description: HOUSE_TEMPLATE_DESCRIPTION,
      cycle_type: "annual",
      config: { stages },
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // A cycle without a template still works — it falls back to the built-in
    // ladder — so this must not stop the cycle being created.
    console.error("ensureHousePhaseTemplate:", error.message);
    return null;
  }
  return (created?.id as string) ?? null;
}

/** The stages a cycle actually runs, or [] when it carries no template. */
export async function getCyclePhaseStages(cycleId: string): Promise<WorkflowStage[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_cycles")
    .select("template:cycle_templates(config)")
    .eq("id", cycleId)
    .maybeSingle();
  const embed = (data as { template?: unknown } | null)?.template;
  const template = (Array.isArray(embed) ? embed[0] : embed) as
    | { config?: Record<string, unknown> }
    | null
    | undefined;
  const stages = template?.config?.stages;
  return Array.isArray(stages) ? (stages as WorkflowStage[]) : [];
}
