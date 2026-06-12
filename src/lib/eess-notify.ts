import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isWebPushConfigured,
  sendWebPush,
  type PushPayload,
  type PushSubscriptionRecord,
} from "@/lib/webpush";
import type { SupabaseClient } from "@supabase/supabase-js";

type Audience = "responders" | "all";
type SourceType = "incident" | "broadcast";

/** Map a push source type to an in-app notification category. */
const NOTIFICATION_CATEGORY: Record<string, string> = {
  incident: "emergency",
  broadcast: "emergency",
  transport_task: "transport",
  flight_update: "flight",
  approval: "approval",
};
/** Profile ids of the tenant's emergency responders (mirrors getAccess().isSafetyAdmin). */
async function responderIds(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const [{ data: admins }, { data: roleRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("role", ["tenant_admin", "super_admin"]),
    admin
      .from("profile_roles")
      .select("profile_id")
      .eq("tenant_id", tenantId)
      .in("role", ["safety_admin", "system_admin"]),
  ]);
  const ids = new Set<string>();
  for (const r of admins ?? []) ids.add(r.id as string);
  for (const r of roleRows ?? []) ids.add(r.profile_id as string);
  return [...ids];
}

/** All active employees in the tenant. */
async function allEmployeeIds(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  return (data ?? []).map((r) => r.id as string);
}

/**
 * Fan an emergency notification out over Web Push and record the result.
 *
 * Best-effort: any failure is logged and swallowed so it can never break the
 * underlying report/broadcast. No-ops cleanly when push or the service-role key
 * isn't configured.
 */
export async function notify(opts: {
  tenantId: string;
  audience: Audience;
  sourceType: SourceType;
  sourceId: string;
  payload: PushPayload;
}): Promise<void> {
  try {
    if (!isWebPushConfigured()) return;
    const admin = createAdminClient();
    if (!admin) return;

    const { tenantId, audience, sourceType, sourceId, payload } = opts;
    const profileIds =
      audience === "all"
        ? await allEmployeeIds(admin, tenantId)
        : await responderIds(admin, tenantId);

    await fanOut(admin, {
      tenantId,
      audience,
      sourceType,
      sourceId,
      payload,
      profileIds,
    });
  } catch (e) {
    console.error("eess notify failed:", (e as Error).message);
  }
}

/**
 * Push a notification to specific people (e.g. the driver a task was just
 * assigned to). Same best-effort semantics as notify().
 */
export async function notifyProfiles(opts: {
  tenantId: string;
  profileIds: string[];
  /** Audience label recorded on the delivery log, e.g. "driver". */
  audience: string;
  /** Must be allowed by the eess_delivery_log source_type check. */
  sourceType: string;
  sourceId: string;
  payload: PushPayload;
}): Promise<void> {
  try {
    if (!isWebPushConfigured() || opts.profileIds.length === 0) return;
    const admin = createAdminClient();
    if (!admin) return;
    await fanOut(admin, opts);
  } catch (e) {
    console.error("notifyProfiles failed:", (e as Error).message);
  }
}

async function fanOut(
  admin: SupabaseClient,
  opts: {
    tenantId: string;
    profileIds: string[];
    audience: string;
    sourceType: string;
    sourceId: string;
    payload: PushPayload;
  },
): Promise<void> {
  const { tenantId, audience, sourceType, sourceId, payload, profileIds } =
    opts;

  // Every push also lands in the in-app notification bell — so recipients with
  // push off still see it. Best-effort, like the rest of the pipeline.
  if (profileIds.length > 0) {
    const category = NOTIFICATION_CATEGORY[sourceType] ?? "general";
    await admin.from("notifications").insert(
      profileIds.map((pid) => ({
        tenant_id: tenantId,
        profile_id: pid,
        category,
        title: payload.title,
        body: payload.body,
        url: payload.url ?? null,
      })),
    );
  }

  let delivered = 0;
  let failed = 0;
  let sent = 0;

  if (profileIds.length > 0) {
    const { data: subs } = await admin
      .from("eess_push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("profile_id", profileIds);

    sent = subs?.length ?? 0;
    const nowIso = new Date().toISOString();

    await Promise.all(
      (subs ?? []).map(async (s) => {
        const record = s as PushSubscriptionRecord;
        try {
          const status = await sendWebPush(record, payload);
          if (status === 404 || status === 410) {
            // Subscription expired/unsubscribed — retire it.
            failed++;
            await admin
              .from("eess_push_subscriptions")
              .update({ is_active: false, last_error: `gone (${status})` })
              .eq("endpoint", record.endpoint);
          } else if (status >= 200 && status < 300) {
            delivered++;
            await admin
              .from("eess_push_subscriptions")
              .update({ last_success_at: nowIso, last_error: null })
              .eq("endpoint", record.endpoint);
          } else {
            failed++;
            await admin
              .from("eess_push_subscriptions")
              .update({ last_error: `http ${status}` })
              .eq("endpoint", record.endpoint);
          }
        } catch (e) {
          failed++;
          await admin
            .from("eess_push_subscriptions")
            .update({ last_error: (e as Error).message.slice(0, 200) })
            .eq("endpoint", record.endpoint);
        }
      }),
    );
  }

  await admin.from("eess_delivery_log").insert({
    tenant_id: tenantId,
    source_type: sourceType,
    source_id: sourceId,
    channel: "push",
    audience,
    recipients: profileIds.length,
    sent,
    delivered,
    failed,
  });
}
