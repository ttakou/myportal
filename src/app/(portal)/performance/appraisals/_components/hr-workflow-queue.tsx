import { createClient } from "@/lib/supabase/server";
import { COMPLETED, REJECTED } from "@/lib/workflow-engine";
import type { WorkflowStage } from "@/types/workflow";
import { WorkflowSection } from "./workflow-section";

/**
 * Appraisals currently sitting on an HR / calibration stage of their configured
 * workflow, with the engine action surface so HR can act. Renders nothing when
 * the active cycle has no workflow or nothing is awaiting HR.
 */
export async function HrWorkflowQueue({ cycleId }: { cycleId: string | null }) {
  if (!cycleId) return null;
  const supabase = createClient();

  const { data: cyc } = await supabase
    .from("appraisal_cycles")
    .select("template_id")
    .eq("id", cycleId)
    .maybeSingle();
  const templateId = (cyc as Record<string, unknown> | null)?.template_id as string | undefined;
  if (!templateId) return null;

  const { data: tpl } = await supabase
    .from("cycle_templates")
    .select("config")
    .eq("id", templateId)
    .maybeSingle();
  const cfg = ((tpl as Record<string, unknown> | null)?.config as Record<string, unknown>) ?? {};
  const stages: WorkflowStage[] = Array.isArray(cfg.stages) ? (cfg.stages as WorkflowStage[]) : [];
  const hrKeys = new Set(
    stages
      .filter((s) => s.responsibleRole === "hr" || s.responsibleRole === "calibration")
      .map((s) => s.key),
  );
  if (hrKeys.size === 0) return null;

  const { data: rows } = await supabase
    .from("appraisals")
    .select("id, current_stage_key, employee:profiles!employee_id(full_name)")
    .eq("cycle_id", cycleId)
    .not("current_stage_key", "is", null);

  const awaiting = ((rows ?? []) as Record<string, unknown>[]).filter((a) => {
    const key = a.current_stage_key as string;
    return key !== COMPLETED && key !== REJECTED && hrKeys.has(key);
  });
  if (awaiting.length === 0) return null;

  const nameOf = (a: Record<string, unknown>): string | undefined => {
    const e = a.employee as { full_name?: string } | { full_name?: string }[] | null;
    const obj = Array.isArray(e) ? e[0] : e;
    return obj?.full_name ?? undefined;
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Awaiting HR ({awaiting.length})</h2>
      {awaiting.map((a) => (
        <WorkflowSection key={a.id as string} appraisalId={a.id as string} heading={nameOf(a)} />
      ))}
    </section>
  );
}
