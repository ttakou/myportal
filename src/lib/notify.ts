import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterByPreference } from "@/lib/notification-prefs";
import { isWebPushConfigured, sendWebPush, type PushSubscriptionRecord } from "@/lib/webpush";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { isDeliverableEmail, notificationEmail } from "@/lib/email-digest-format";
import { loadModuleStates } from "@/lib/module-notify-state";
import { emailAllowed, moduleFor, notifyAllowed, urlSegment } from "@/lib/notification-modules";

/**
 * Deliver a notification to specific people: writes the in-app bell record and,
 * for those who allow it, sends a Web Push. Email goes out in the next morning
 * digest (one email per person per day, see lib/email-digest.ts) rather than
 * one email per notification; only someone who muted the bell but kept email
 * on is emailed straight away, since the digest reads from the bell.
 * `instantEmail` is for news that is stale by tomorrow (a visitor waiting at
 * reception): it is emailed at once and kept out of the morning digest.
 * A module the tenant has switched off sends nothing; one whose email switch
 * is off still rings the bell and the phone but is never emailed (the module
 * is the one named, else the one the link opens).
 * Preference-aware and best-effort — never throws into the caller.
 */
export async function notifyUsers(input: {
  tenantId: string;
  profileIds: (string | null | undefined)[];
  category: "transport" | "flight" | "approval" | "general";
  title: string;
  body?: string;
  url?: string;
  /** Email it now instead of in the next morning digest. */
  instantEmail?: boolean;
  /** The module it comes from, when its link does not say (e.g. a dashboard link). */
  module?: string;
  /** A decision's deadline: pinned in the bell as "decide before…" until then. */
  dueAt?: string | null;
  /** The request it is about ("move:<id>"), so deciding it clears the notice. */
  ref?: string | null;
}): Promise<void> {
  try {
    const ids = [...new Set(input.profileIds.filter((x): x is string => Boolean(x)))];
    if (!ids.length) return;
    const admin = createAdminClient();
    if (!admin) return;

    const states = await loadModuleStates(admin, [input.tenantId]);
    const mod = moduleFor(states.get(input.tenantId), input.url, input.module);
    if (!notifyAllowed(mod)) return;
    const mayEmail = emailAllowed(mod);

    const { inApp, push, email: wantEmail } = await filterByPreference(admin, ids, input.category);
    const email = mayEmail ? wantEmail : [];

    const sendNowToAll = Boolean(input.instantEmail) && isEmailConfigured() && mayEmail;
    if (inApp.length) {
      const stamp = sendNowToAll ? new Date().toISOString() : null;
      await admin.from("notifications").insert(
        inApp.map((pid) => ({
          tenant_id: input.tenantId,
          profile_id: pid,
          category: input.category,
          title: input.title,
          body: input.body ?? null,
          url: input.url ?? null,
          module: input.module ?? urlSegment(input.url) ?? null,
          due_at: input.dueAt ?? null,
          ref: input.ref ?? null,
          // Emailed below, so the morning digest leaves it out.
          emailed_at: stamp,
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

    const inBell = new Set(inApp);
    const emailNow = sendNowToAll ? email : email.filter((pid) => !inBell.has(pid));
    if (isEmailConfigured() && emailNow.length) {
      const { data: people } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", emailNow)
        .not("email", "is", null);
      const { html, text } = notificationEmail({
        title: input.title,
        body: input.body,
        url: input.url,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://mportals.com",
      });
      await Promise.all(
        ((people ?? []) as Record<string, any>[]).map((p) =>
          isDeliverableEmail(p.email)
            ? sendEmail({ to: p.email as string, subject: input.title, html, text })
            : Promise.resolve(false),
        ),
      );
    }
  } catch (e) {
    console.error("notifyUsers failed:", (e as Error).message);
  }
}

/**
 * Notify the offshore approvers (Campboss + OIM) of the tenant — e.g. when a
 * new trip or visit request lands in their queue. Resolved on the service-role
 * client because a regular requester can't read other people's functional
 * roles under RLS. Best-effort like notifyUsers.
 */
export async function notifyOffshoreApprovers(input: {
  tenantId: string;
  title: string;
  body?: string;
  url?: string;
  dueAt?: string | null;
  ref?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data } = await admin
      .from("profile_roles")
      .select("profile_id")
      .eq("tenant_id", input.tenantId)
      .in("role", ["campboss", "oim"]);
    await notifyUsers({
      tenantId: input.tenantId,
      profileIds: (data ?? []).map((r) => r.profile_id as string),
      category: "approval",
      title: input.title,
      body: input.body,
      url: input.url ?? "/offshore",
      module: "offshore",
      dueAt: input.dueAt,
      ref: input.ref,
    });
  } catch (e) {
    console.error("notifyOffshoreApprovers failed:", (e as Error).message);
  }
}

/**
 * The request a notice was about has been decided (or withdrawn): mark its
 * open notices read for everyone who was told, so it stops asking. Best-effort.
 */
export async function closeNotices(tenantId: string, refs: string[]): Promise<void> {
  try {
    const list = refs.filter(Boolean);
    if (!list.length) return;
    const admin = createAdminClient();
    if (!admin) return;
    await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .in("ref", list)
      .is("read_at", null);
  } catch (e) {
    console.error("closeNotices failed:", (e as Error).message);
  }
}

/**
 * Trips were decided (cleared, rejected, cancelled): clear each trip-request
 * notice that covers them once none of its trips is still waiting.
 */
export async function closeTripNotices(tenantId: string, tripIds: string[]): Promise<void> {
  try {
    const ids = [...new Set(tripIds.filter(Boolean))];
    if (!ids.length) return;
    const admin = createAdminClient();
    if (!admin) return;
    const { tripIdsOfRef } = await import("@/lib/notification-groups");
    const { data: open } = await admin
      .from("notifications")
      .select("ref")
      .eq("tenant_id", tenantId)
      .is("read_at", null)
      .like("ref", "trips:%")
      .or(ids.map((id) => `ref.like.*${id}*`).join(","));
    const refs = [...new Set(((open ?? []) as { ref: string }[]).map((r) => r.ref))];
    const done: string[] = [];
    for (const ref of refs) {
      const covered = tripIdsOfRef(ref);
      const { count } = await admin
        .from("offshore_trips")
        .select("id", { count: "exact", head: true })
        .in("id", covered)
        .eq("status", "requested");
      if ((count ?? 0) === 0) done.push(ref);
    }
    await closeNotices(tenantId, done);
  } catch (e) {
    console.error("closeTripNotices failed:", (e as Error).message);
  }
}
