"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import {
  CHANNELS,
  NOTIFICATION_EVENTS,
  RECIPIENT_ROLES,
  type NotificationRule,
} from "@/types/notifications";

async function ensureHr() {
  const access = await getAccess();
  return access.isHr || access.isSystemAdmin || access.isAdmin;
}

const TIMINGS = ["immediate", "before", "after"] as const;
const FREQS = ["once", "daily", "until_complete"] as const;

function clean(rule: NotificationRule) {
  return {
    event: NOTIFICATION_EVENTS.includes(rule.event) ? rule.event : "cycle_launch",
    recipients: (rule.recipients ?? []).filter((r) => RECIPIENT_ROLES.includes(r)),
    custom_emails: (rule.customEmails ?? [])
      .map((e) => e.trim())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),
    channels: (rule.channels ?? []).filter((c) => CHANNELS.includes(c)),
    subject_template: rule.subjectTemplate?.trim() || null,
    body_template: rule.bodyTemplate?.trim() || null,
    timing: TIMINGS.includes(rule.timing) ? rule.timing : "immediate",
    offset_days: Math.max(0, Math.min(90, Math.round(rule.offsetDays || 0))),
    frequency: FREQS.includes(rule.frequency) ? rule.frequency : "once",
    escalate_after_days:
      rule.escalateAfterDays == null ? null : Math.max(0, Math.min(90, Math.round(rule.escalateAfterDays))),
    escalate_to: rule.escalateTo && RECIPIENT_ROLES.includes(rule.escalateTo) ? rule.escalateTo : null,
    is_enabled: rule.isEnabled !== false,
    updated_at: new Date().toISOString(),
  };
}

export async function saveNotificationRule(rule: NotificationRule): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can edit notifications." };
  const supabase = createClient();
  const fields = clean(rule);
  if (fields.channels.length === 0) return { ok: false, error: "Pick at least one delivery channel." };

  if (rule.id && !rule.id.startsWith("new-")) {
    const { error } = await supabase.from("notification_rules").update(fields).eq("id", rule.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (!tenant) return { ok: false, error: "No tenant in scope." };
    const { error } = await supabase
      .from("notification_rules")
      .insert({ ...fields, tenant_id: tenant.id });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/performance/settings/notifications");
  return { ok: true };
}

export async function deleteNotificationRule(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can edit notifications." };
  const supabase = createClient();
  const { error } = await supabase.from("notification_rules").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/notifications");
  return { ok: true };
}
