import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterByPreference } from "@/lib/notification-prefs";
import { isWebPushConfigured, sendWebPush, type PushSubscriptionRecord } from "@/lib/webpush";

/**
 * Deliver a notification to specific people: writes the in-app bell record and,
 * for those who allow it, sends a Web Push. Preference-aware and best-effort —
 * never throws into the caller.
 */
export async function notifyUsers(input: {
  tenantId: string;
  profileIds: (string | null | undefined)[];
  category: "transport" | "flight" | "approval" | "general";
  title: string;
  body?: string;
  url?: string;
}): Promise<void> {
  try {
    const ids = [...new Set(input.profileIds.filter((x): x is string => Boolean(x)))];
    if (!ids.length) return;
    const admin = createAdminClient();
    if (!admin) return;

    const { inApp, push } = await filterByPreference(admin, ids, input.category);

    if (inApp.length) {
      await admin.from("notifications").insert(
        inApp.map((pid) => ({
          tenant_id: input.tenantId,
          profile_id: pid,
          category: input.category,
          title: input.title,
          body: input.body ?? null,
          url: input.url ?? null,
        })),
      );
    }

    if (isWebPushConfigured() && push.length) {
      const { data: subs } = await admin
        .from("eess_push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("tenant_id", input.tenantId)
        .eq("is_active", true)
        .in("profile_id", push);
      await Promise.all(
        (subs ?? []).map(async (s) => {
          const rec = s as PushSubscriptionRecord;
          try {
            const status = await sendWebPush(rec, {
              title: input.title,
              body: input.body ?? "",
              url: input.url,
            });
            if (status === 404 || status === 410) {
              await admin
                .from("eess_push_subscriptions")
                .update({ is_active: false, last_error: `gone (${status})` })
                .eq("endpoint", rec.endpoint);
            }
          } catch {
            /* best-effort */
          }
        }),
      );
    }
  } catch (e) {
    console.error("notifyUsers failed:", (e as Error).message);
  }
}
