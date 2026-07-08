import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";
import {
  COMPLETED,
  REJECTED,
  isStageOverdue,
  responsibleUserId,
} from "@/lib/workflow-engine";
import type { WorkflowStage } from "@/types/workflow";

const todayIso = () => new Date().toISOString().slice(0, 10);

interface EscalationSummary {
  ok: boolean;
  overdue: number;
  reminded: number;
  error?: string;
}

/**
 * Sweep template-driven cycles and nudge whoever owns a workflow stage that is
 * past its due date (cycle start + stage.dueOffsetDays). Pass a tenantId to
 * scope (HR-triggered); omit for the cron sweep. Uses the service-role client.
 */
export async function runWorkflowEscalations(tenantId?: string): Promise<EscalationSummary> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, overdue: 0, reminded: 0, error: "Service-role key missing." };
  const today = todayIso();

  let cyclesQ = admin
    .from("appraisal_cycles")
    .select("id, tenant_id, period_start, template_id")
    .eq("status", "active")
    .not("template_id", "is", null);
  if (tenantId) cyclesQ = cyclesQ.eq("tenant_id", tenantId);
  const { data: cycles } = await cyclesQ;
  if (!cycles?.length) return { ok: true, overdue: 0, reminded: 0 };

  // Resolve each cycle's template stages once.
  const templateIds = [...new Set(cycles.map((c) => c.template_id as string))];
  const { data: templates } = await admin
    .from("cycle_templates")
    .select("id, config")
    .in("id", templateIds);
  const stagesByTemplate = new Map<string, WorkflowStage[]>(
    (templates ?? []).map((t) => {
      const cfg = (t.config as Record<string, unknown>) ?? {};
      return [t.id as string, Array.isArray(cfg.stages) ? (cfg.stages as WorkflowStage[]) : []];
    }),
  );

  let overdue = 0;
  let reminded = 0;

  for (const c of cycles) {
    const stages = stagesByTemplate.get(c.template_id as string) ?? [];
    if (!stages.length || !c.period_start) continue;

    const { data: appraisals } = await admin
      .from("appraisals")
      .select("id, tenant_id, employee_id, manager_id, second_level_id, current_stage_key")
      .eq("cycle_id", c.id)
      .not("current_stage_key", "is", null);

    for (const a of appraisals ?? []) {
      const key = a.current_stage_key as string;
      if (key === COMPLETED || key === REJECTED) continue;
      const stage = stages.find((s) => s.key === key);
      if (!stage || !stage.notify) continue;
      if (!isStageOverdue(stage, c.period_start as string, today)) continue;

      overdue += 1;
      const owner = responsibleUserId(stage.responsibleRole, a);
      if (owner) {
        await notifyUsers({
          tenantId: a.tenant_id as string,
          profileIds: [owner],
          category: "approval",
          title: `Overdue: ${stage.label}`,
          body: `The "${stage.label}" stage is past its due date — please action it.`,
          url: "/performance/appraisals",
        });
        reminded += 1;
      }
      await admin.from("appraisal_events").insert({
        tenant_id: a.tenant_id,
        appraisal_id: a.id,
        stage: stage.key,
        action: "workflow_overdue",
      });
    }
  }

  return { ok: true, overdue, reminded };
}
