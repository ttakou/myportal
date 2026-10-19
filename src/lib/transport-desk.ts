import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { holdersOfVerb } from "@/lib/verb-holders";
import { getModuleSettingsForTenant } from "@/lib/module-settings";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { notificationEmail, parseMailboxes } from "@/lib/email-digest-format";

/**
 * Who the dispatch desk is: the active people whose access role grants the
 * transportation `approve` or `manage` verb, else every tenant admin.
 */
export async function deskIdsFor(client: SupabaseClient, tenantId: string): Promise<string[]> {
  return holdersOfVerb(client, tenantId, "transportation", ["approve", "manage"]);
}

/**
 * Email the tenant's dispatch desk mailbox (Admin › Modules › Transportation
 * › Dispatch desk mailbox) with a desk notification, at once: a shared
 * request inbox is worked through the day, not read as a morning digest.
 * Best-effort and silent when no mailbox is set or email is not configured.
 */
export async function emailDeskMailbox(
  client: SupabaseClient,
  tenantId: string,
  msg: { title: string; body?: string; url?: string },
): Promise<void> {
  try {
    if (!isEmailConfigured()) return;
    const cfg = await getModuleSettingsForTenant(client, tenantId, "transportation");
    const boxes = parseMailboxes(cfg.desk_email);
    if (boxes.length === 0) return;
    const { html, text } = notificationEmail({
      title: msg.title,
      body: msg.body,
      url: msg.url,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://mportals.com",
    });
    await Promise.all(boxes.map((to) => sendEmail({ to, subject: `Transport: ${msg.title}`, html, text })));
  } catch (e) {
    console.error("emailDeskMailbox failed:", (e as Error).message);
  }
}
