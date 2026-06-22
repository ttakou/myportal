import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Channel,
  Frequency,
  NotificationEvent,
  NotificationRule,
  RecipientRole,
  Timing,
} from "@/types/notifications";

function ruleFromRow(r: Record<string, unknown>): NotificationRule {
  return {
    id: String(r.id),
    event: r.event as NotificationEvent,
    recipients: Array.isArray(r.recipients) ? (r.recipients as RecipientRole[]) : [],
    customEmails: Array.isArray(r.custom_emails) ? (r.custom_emails as string[]) : [],
    channels: Array.isArray(r.channels) ? (r.channels as Channel[]) : [],
    subjectTemplate: (r.subject_template as string | null) ?? "",
    bodyTemplate: (r.body_template as string | null) ?? "",
    timing: (r.timing as Timing) ?? "immediate",
    offsetDays: Number(r.offset_days ?? 0),
    frequency: (r.frequency as Frequency) ?? "once",
    escalateAfterDays: r.escalate_after_days == null ? null : Number(r.escalate_after_days),
    escalateTo: (r.escalate_to as RecipientRole | null) ?? null,
    isEnabled: r.is_enabled !== false,
  };
}

/** All notification rules for the tenant, ordered by event. */
export async function getNotificationRules(): Promise<NotificationRule[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("notification_rules")
    .select("*")
    .order("event", { ascending: true })
    .order("created_at", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map(ruleFromRow);
}
