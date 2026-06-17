import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";

const todayIso = () => new Date().toISOString().slice(0, 10);

type Row = {
  id: string;
  tenant_id: string;
  employee_id: string;
  manager_id: string | null;
  stage: string;
  status: string;
};

/** Whose action a given appraisal is currently waiting on (or null = HR/none). */
function currentOwner(a: Row): string | null {
  if (a.status === "pending_manager_review") return a.manager_id;
  if (a.status === "ready_for_final_discussion") return a.manager_id;
  if (a.status === "pending_employee_acknowledgement") return a.employee_id;
  if (["not_started", "draft", "returned_for_correction"].includes(a.status)) {
    return a.stage === "manager_review" ? a.manager_id : a.employee_id;
  }
  return null; // pending_hr_review / under_appeal / second_level → HR-side
}

/**
 * Flag overdue goal-setting and nudge whoever currently owns each in-progress
 * appraisal. Pass a tenantId to scope to one tenant (HR-triggered); omit for the
 * cron sweep across all tenants. Uses the service-role client.
 */
export async function runAppraisalReminders(
  tenantId?: string,
): Promise<{ ok: boolean; overdue: number; reminded: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, overdue: 0, reminded: 0, error: "Service-role key missing." };
  const today = todayIso();

  let cyclesQ = admin
    .from("appraisal_cycles")
    .select("id, tenant_id, goal_setting_deadline")
    .eq("status", "active");
  if (tenantId) cyclesQ = cyclesQ.eq("tenant_id", tenantId);
  const { data: cycles } = await cyclesQ;

  let overdue = 0;
  let reminded = 0;

  for (const c of cycles ?? []) {
    const { data: appraisals } = await admin
      .from("appraisals")
      .select("id, tenant_id, employee_id, manager_id, stage, status")
      .eq("cycle_id", c.id);

    for (const a of (appraisals ?? []) as Row[]) {
      if (["closed", "completed", "overdue"].includes(a.status)) continue;

      const goalsOverdue =
        a.stage === "goal_setting" &&
        c.goal_setting_deadline &&
        (c.goal_setting_deadline as string) < today &&
        ["not_started", "draft", "returned_for_correction"].includes(a.status);

      if (goalsOverdue) {
        await admin.from("appraisals").update({ status: "overdue" }).eq("id", a.id);
        await admin.from("appraisal_events").insert({
          tenant_id: a.tenant_id,
          appraisal_id: a.id,
          stage: a.stage,
          action: "marked_overdue",
        });
        overdue += 1;
        const recips = [a.employee_id, a.manager_id].filter(Boolean) as string[];
        if (recips.length)
          await notifyUsers({
            tenantId: a.tenant_id,
            profileIds: recips,
            category: "approval",
            title: "Goal-setting overdue",
            body: "The goal-setting deadline has passed — please complete it.",
            url: "/performance/appraisals",
          });
        continue;
      }

      const owner = currentOwner(a);
      if (owner) {
        await notifyUsers({
          tenantId: a.tenant_id,
          profileIds: [owner],
          category: "approval",
          title: "Appraisal action needed",
          body: "You have a pending appraisal step — please action it.",
          url: "/performance/appraisals",
        });
        reminded += 1;
      }
    }
  }

  return { ok: true, overdue, reminded };
}
