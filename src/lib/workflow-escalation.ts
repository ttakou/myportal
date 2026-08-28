import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";
import {
  COMPLETED,
  REJECTED,
  activeStageKeys,
  isStageOverdue,
  responsibleUserId,
  stageDueDate,
} from "@/lib/workflow-engine";
import { dispatchScheduledEvent } from "@/lib/notify-dispatch";
import { deadlineEventFor, deadlinePhrase } from "@/lib/performance/deadline-notices";
import {
  pickHrRecipients,
  pickPgmRecipients,
  ROLE_HOLDER_ROLES,
  type RoleHolder,
} from "@/lib/performance/hr-recipients";
import { appraisableIdsForTenant } from "@/lib/performance/roster";
import type { WorkflowStage } from "@/types/workflow";

const todayIso = () => new Date().toISOString().slice(0, 10);

interface EscalationSummary {
  ok: boolean;
  overdue: number;
  reminded: number;
  /** Deadline notices raised through the tenant's configured rules. */
  notified: number;
  error?: string;
}

/**
 * Sweep template-driven cycles and nudge whoever owns a workflow stage that is
 * past its due date (cycle start + stage.dueOffsetDays). Pass a tenantId to
 * scope (HR-triggered); omit for the cron sweep. Uses the service-role client.
 */
export async function runWorkflowEscalations(tenantId?: string): Promise<EscalationSummary> {
  const admin = createAdminClient();
  if (!admin)
    return { ok: false, overdue: 0, reminded: 0, notified: 0, error: "Service-role key missing." };
  const today = todayIso();

  let cyclesQ = admin
    .from("appraisal_cycles")
    .select("id, tenant_id, period_start, template_id")
    .eq("status", "active")
    .not("template_id", "is", null);
  if (tenantId) cyclesQ = cyclesQ.eq("tenant_id", tenantId);
  const { data: cycles } = await cyclesQ;
  if (!cycles?.length) return { ok: true, overdue: 0, reminded: 0, notified: 0 };

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
  let notified = 0;
  // Both resolved per tenant, once, and only when actually needed.
  const rosterByTenant = new Map<string, Set<string>>();
  const holdersByTenant = new Map<string, RoleHolder[]>();
  async function holdersFor(tenantId: string): Promise<RoleHolder[]> {
    const cached = holdersByTenant.get(tenantId);
    if (cached) return cached;
    const { data } = await admin!
      .from("profile_roles")
      .select("profile_id, role")
      .eq("tenant_id", tenantId)
      .in("role", ROLE_HOLDER_ROLES);
    const holders = (data ?? []) as RoleHolder[];
    holdersByTenant.set(tenantId, holders);
    return holders;
  }
  /** Whoever should be chased for a stage nobody is named on. */
  async function roleHoldersFor(tenantId: string, role: string): Promise<string[]> {
    const holders = await holdersFor(tenantId);
    return role === "pgm" ? pickPgmRecipients(holders) : pickHrRecipients(holders);
  }

  for (const c of cycles) {
    const stages = stagesByTemplate.get(c.template_id as string) ?? [];
    if (!stages.length || !c.period_start) continue;

    const cycleTenant = c.tenant_id as string;
    if (!rosterByTenant.has(cycleTenant)) {
      rosterByTenant.set(cycleTenant, await appraisableIdsForTenant(admin, cycleTenant));
    }
    const roster = rosterByTenant.get(cycleTenant)!;

    // `current_stage_key` is only written once somebody acts, so filtering on
    // it excluded every appraisal nobody had touched — which is exactly the
    // population that needs chasing. Where it is unset the live stage is read
    // from the completed steps, the same way every screen reads it.
    const { data: appraisals } = await admin
      .from("appraisals")
      .select(
        "id, tenant_id, employee_id, manager_id, second_level_id, current_stage_key, completed_stages",
      )
      .eq("cycle_id", c.id);

    for (const a of appraisals ?? []) {
      // Somebody outside the workflow's population can act on nothing here.
      if (!roster.has(a.employee_id as string)) continue;
      const key = a.current_stage_key as string | null;
      if (key === COMPLETED || key === REJECTED) continue;
      const done = Array.isArray(a.completed_stages) ? (a.completed_stages as string[]) : [];
      const liveKey = key ?? activeStageKeys(stages, {}, done)[0] ?? null;
      if (!liveKey) continue;
      const stage = stages.find((s) => s.key === liveKey);
      if (!stage || !stage.notify) continue;

      // Raise the tenant's configured deadline rules, whichever side of the due
      // date today falls. These two events were configurable from the start but
      // never raised anywhere, so every rule an administrator set was silent.
      const dueDate = stageDueDate(stage, c.period_start as string);
      const event = deadlineEventFor({ dueDate, today });
      if (event) {
        const stageOwner = responsibleUserId(stage.responsibleRole, a);
        await dispatchScheduledEvent(
          event,
          {
            tenantId: a.tenant_id as string,
            employeeIds: a.employee_id ? [a.employee_id as string] : [],
            managerIds: a.manager_id ? [a.manager_id as string] : [],
            secondLevelIds: a.second_level_id ? [a.second_level_id as string] : [],
            placeholders: {
              stage: stage.label,
              deadline: dueDate,
              status: deadlinePhrase({ dueDate, today }),
            },
            url: "/performance/appraisals",
          },
          { dueDate, today },
        );
        if (stageOwner) notified += 1;
      }

      if (!isStageOverdue(stage, c.period_start as string, today)) continue;

      overdue += 1;
      // HR and calibration stages name no individual — the role is the owner —
      // so chase whoever holds it rather than chasing nobody.
      const owner = responsibleUserId(stage.responsibleRole, a);
      const recipients = owner
        ? [owner]
        : await roleHoldersFor(a.tenant_id as string, stage.responsibleRole);
      if (recipients.length) {
        await notifyUsers({
          tenantId: a.tenant_id as string,
          profileIds: recipients,
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

  return { ok: true, overdue, reminded, notified };
}
