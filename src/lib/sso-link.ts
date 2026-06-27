import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

type MatchRow = {
  id: string;
  tenant_id: string;
  role: string;
  manager_id: string | null;
  department: string | null;
  emp_num: string | null;
  employee_type: string | null;
  lunch_eligible: boolean | null;
  job_title: string | null;
  full_name: string | null;
};

/**
 * Reconcile a fresh SSO sign-in against an existing organisation account with
 * the same email, so a returning employee doesn't end up as a duplicate
 * "new user".
 *
 * Runs only for a brand-new, tenant-less profile (no-ops for normal logins).
 *
 *  - Exactly one match that is a *pristine* registration stub (never signed in,
 *    nothing depends on it) → adopt its tenant/role/manager/access onto the SSO
 *    account and remove the stub. Seamless.
 *  - Anything riskier (the match has history, or there are several) → leave the
 *    user pending and alert the org's admins to merge by hand. Never deletes or
 *    orphans data automatically.
 */
export async function adoptOrFlagSsoUser(
  userId: string,
  email: string | null,
): Promise<"adopted" | "flagged" | "noop"> {
  if (!email) return "noop";
  const admin = createAdminClient();
  if (!admin) return "noop";

  // Only act on a brand-new, tenant-less profile.
  const { data: me } = await admin
    .from("profiles")
    .select("tenant_id, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!me || me.tenant_id) return "noop";

  // Existing active org accounts that share this email (a prior registration).
  const { data: matches } = await admin
    .from("profiles")
    .select(
      "id, tenant_id, role, manager_id, department, emp_num, employee_type, lunch_eligible, job_title, full_name",
    )
    .ilike("email", email)
    .not("tenant_id", "is", null)
    .eq("is_active", true)
    .neq("id", userId);
  const candidates = (matches ?? []) as MatchRow[];
  if (candidates.length === 0) return "noop";

  if (candidates.length === 1) {
    const old = candidates[0];
    // Only auto-adopt a pristine, never-used registration stub.
    const { data: oldAuth } = await admin.auth.admin.getUserById(old.id);
    const neverSignedIn = !oldAuth?.user?.last_sign_in_at;
    const { data: rc } = await admin.rpc("profile_external_reference_count", { p_id: old.id });
    const refCount = typeof rc === "number" ? rc : Number(rc ?? 1);
    if (neverSignedIn && refCount === 0) {
      await adopt(admin, userId, (me.full_name as string | null) ?? null, old);
      return "adopted";
    }
  }

  // Ambiguous or has history → don't touch it; route to admins.
  await flagForAdmins(admin, userId, email, candidates);
  return "flagged";
}

/** Promote the SSO account into the org and retire the never-used stub. */
async function adopt(
  admin: SupabaseClient,
  newId: string,
  newFullName: string | null,
  old: MatchRow,
): Promise<void> {
  // Capture the stub's roles before we retire it.
  const [{ data: roles }, { data: aroles }] = await Promise.all([
    admin.from("profile_roles").select("role").eq("profile_id", old.id),
    admin.from("profile_access_roles").select("role_id").eq("profile_id", old.id),
  ]);

  // Free the stub's unique emp_num first, so it can move to the SSO account
  // without tripping the unique index, and so it stops matching future lookups.
  await admin.from("profiles").update({ is_active: false, emp_num: null }).eq("id", old.id);

  // Promote the SSO account with the stub's organisation attributes.
  await admin
    .from("profiles")
    .update({
      tenant_id: old.tenant_id,
      role: old.role,
      manager_id: old.manager_id,
      department: old.department,
      emp_num: old.emp_num,
      employee_type: old.employee_type ?? "employee",
      lunch_eligible: old.lunch_eligible ?? true,
      job_title: old.job_title,
      full_name: newFullName || old.full_name,
      access_requested_at: null,
    })
    .eq("id", newId);

  if (roles && roles.length > 0) {
    await admin
      .from("profile_roles")
      .insert(roles.map((r) => ({ profile_id: newId, role: r.role, tenant_id: old.tenant_id })));
  }
  if (aroles && aroles.length > 0) {
    await admin
      .from("profile_access_roles")
      .insert(aroles.map((r) => ({ profile_id: newId, role_id: r.role_id, tenant_id: old.tenant_id })));
  }

  // Remove the now-empty stub auth user (cascades its retired profile).
  // Best-effort: the SSO account is already fully promoted, so a failure here
  // only leaves a harmless deactivated row for an admin to clean up.
  try {
    await admin.auth.admin.deleteUser(old.id);
  } catch {
    // ignore — the stub is already deactivated and de-duplicated.
  }
}

/** Leave the user pending and notify the org's admins of a probable duplicate. */
async function flagForAdmins(
  admin: SupabaseClient,
  newId: string,
  email: string,
  matches: MatchRow[],
): Promise<void> {
  await admin
    .from("profiles")
    .update({ access_requested_at: new Date().toISOString() })
    .eq("id", newId);

  const tenantId = matches[0]?.tenant_id;
  if (!tenantId) return;
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
  if (recipients.length === 0) return;
  await admin.from("notifications").insert(
    recipients.map((pid) => ({
      tenant_id: tenantId,
      profile_id: pid,
      category: "general",
      title: "Duplicate sign-in to review",
      body: `${email} signed in via SSO and matches an existing account. Review pending users to grant access or merge.`,
      url: "/admin?view=people",
    })),
  );
}
