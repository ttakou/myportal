import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { renderTemplate, resolveRuleProfileIds, type DispatchContext } from "@/lib/notify-template";
import type { NotificationEvent, NotificationRule, RecipientRole } from "@/types/notifications";

export type { DispatchContext } from "@/lib/notify-template";
export { renderTemplate, resolveRuleProfileIds } from "@/lib/notify-template";

function ruleFromRow(r: Record<string, unknown>): NotificationRule {
  return {
    id: String(r.id),
    event: r.event as NotificationEvent,
    recipients: Array.isArray(r.recipients) ? (r.recipients as RecipientRole[]) : [],
    customEmails: Array.isArray(r.custom_emails) ? (r.custom_emails as string[]) : [],
    channels: Array.isArray(r.channels) ? (r.channels as NotificationRule["channels"]) : [],
    subjectTemplate: (r.subject_template as string | null) ?? "",
    bodyTemplate: (r.body_template as string | null) ?? "",
    timing: (r.timing as NotificationRule["timing"]) ?? "immediate",
    offsetDays: Number(r.offset_days ?? 0),
    frequency: (r.frequency as NotificationRule["frequency"]) ?? "once",
    escalateAfterDays: r.escalate_after_days == null ? null : Number(r.escalate_after_days),
    escalateTo: (r.escalate_to as RecipientRole | null) ?? null,
    isEnabled: r.is_enabled !== false,
  };
}

async function sendTeams(text: string): Promise<void> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Dispatch a configured notification event: resolves the tenant's enabled rules
 * for the event, renders templates, and delivers per channel (in-app/email via
 * notifyUsers, Microsoft Teams via webhook, plus any explicit addresses).
 * Only `immediate` rules fire here; before/after rules are driven by the cron.
 * Best-effort — never throws into the caller.
 */
export async function dispatchEvent(event: NotificationEvent, ctx: DispatchContext): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data } = await admin
      .from("notification_rules")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .eq("event", event)
      .eq("is_enabled", true);

    const rules = ((data ?? []) as Record<string, unknown>[]).map(ruleFromRow);
    const values = ctx.placeholders ?? {};

    for (const rule of rules) {
      if (rule.timing !== "immediate") continue; // scheduled timings handled by cron
      const title = renderTemplate(rule.subjectTemplate, values) || event.replace(/_/g, " ");
      const body = renderTemplate(rule.bodyTemplate, values);
      const wantsInApp = rule.channels.includes("in_app");
      const wantsEmail = rule.channels.includes("email");
      const wantsTeams = rule.channels.includes("teams");

      const profileIds = resolveRuleProfileIds(rule.recipients, ctx);

      // In-app and/or email to resolved recipients (preference-aware).
      if ((wantsInApp || wantsEmail) && profileIds.length) {
        await notifyUsers({
          tenantId: ctx.tenantId,
          profileIds,
          category: "approval",
          title,
          body,
          url: ctx.url ?? "/performance/appraisals",
        });
      }

      // Explicit extra addresses (HR distribution lists etc.).
      if (wantsEmail && rule.customEmails.length && isEmailConfigured()) {
        const html = `<p>${title}</p>${body ? `<p>${body}</p>` : ""}`;
        await Promise.all(
          rule.customEmails.map((to) => sendEmail({ to, subject: title, html, text: body })),
        );
      }

      if (wantsTeams) await sendTeams(`${title}${body ? ` — ${body}` : ""}`);
    }
  } catch (e) {
    console.error("dispatchEvent failed:", (e as Error).message);
  }
}
