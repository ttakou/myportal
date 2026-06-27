"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A tenant-less ("pending") user asks an administrator to be granted access.
 * Best-effort: stamps the request time (so it shows in the admin queue) and,
 * when the email domain matches an existing organisation, notifies that
 * org's administrators. Throttled to one notification per 24h.
 */
export async function requestAccess(): Promise<ActionResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is not configured for this action." };

  const { data: me } = await admin
    .from("profiles")
    .select("id, email, full_name, tenant_id, access_requested_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) return { ok: false, error: "Profile not found." };
  if (me.tenant_id) return { ok: true }; // already onboarded

  const alreadyNotified =
    me.access_requested_at != null &&
    Date.now() - new Date(me.access_requested_at).getTime() < DAY_MS;

  // Record the request regardless — it drives the admin queue's "requested" flag.
  await admin
    .from("profiles")
    .update({ access_requested_at: new Date().toISOString() })
    .eq("id", user.id);

  if (alreadyNotified) return { ok: true };

  // Best-effort routing: find an organisation whose members share this email
  // domain, then notify its administrators.
  const email = (me.email ?? user.email ?? "").toLowerCase();
  const domain = email.includes("@") ? email.split("@")[1] : "";
  if (domain) {
    const { data: peers } = await admin
      .from("profiles")
      .select("tenant_id")
      .not("tenant_id", "is", null)
      .ilike("email", `%@${domain}`)
      .limit(50);
    const tenantId = peers?.[0]?.tenant_id as string | undefined;
    if (tenantId) {
      const { data: admins } = await admin
        .from("profiles")
        .select("id, role, profile_roles(role)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      const recipients = (admins ?? [])
        .filter(
          (a: Record<string, any>) =>
            a.role === "tenant_admin" ||
            a.role === "super_admin" ||
            (a.profile_roles ?? []).some((r: { role: string }) =>
              ["hr_admin", "system_admin"].includes(r.role),
            ),
        )
        .map((a: { id: string }) => a.id);
      if (recipients.length > 0) {
        await admin.from("notifications").insert(
          recipients.map((pid) => ({
            tenant_id: tenantId,
            profile_id: pid,
            category: "general",
            title: "Access request",
            body: `${me.full_name ?? email} signed in but has no access yet. Review pending users.`,
            url: "/admin?view=people",
          })),
        );
      }
    }
  }

  return { ok: true };
}
