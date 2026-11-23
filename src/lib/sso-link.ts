import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoLinkTarget, findAccountMatches, isOrgDomain, type AccountMatch } from "@/lib/account-match";

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
): Promise<"adopted" | "linked" | "flagged" | "noop"> {
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
  // No account with this email: look for the person by name — the offshore
  // roster registers many people with no email at all.
  if (candidates.length === 0) return linkByName(admin, userId, email, (me.full_name as string | null) ?? null);

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
    // Same email, never used, from the organisation's own domain: the same
    // person, whose records (trips, crew, room…) move onto this sign-in.
    if (neverSignedIn && isOrgDomain(email, await orgDomains(admin, old.tenant_id))) {
      if (await mergeInto(admin, old.id, userId)) return "linked";
    }
  }

  // Ambiguous or has history → don't touch it; route to admins.
  await flagForAdmins(admin, userId, email, candidates);
  return "flagged";
}

/** The organisation's own email domains (tenant setting `sso_domains`). */
async function orgDomains(admin: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data } = await admin.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  const list = (data?.settings as { sso_domains?: unknown } | null)?.sso_domains;
  return Array.isArray(list) ? list.filter((d): d is string => typeof d === "string") : [];
}

/** Move the old account's records onto the sign-in account and retire it. */
async function mergeInto(admin: SupabaseClient, fromId: string, toId: string): Promise<boolean> {
  const { error } = await admin.rpc("merge_profile_into", { p_from: fromId, p_to: toId });
  if (error) {
    console.error("sso-link merge:", error.message);
    return false;
  }
  return true;
}

/**
 * Existing accounts in any organisation whose name matches the person who
 * just signed in — by display name or by the name their email spells — with
 * whether each was ever signed in to. Read with the service role.
 */
export async function nameMatchesFor(
  admin: SupabaseClient,
  signIn: { id: string; email: string | null; fullName: string | null },
): Promise<(AccountMatch & { tenant_id: string })[]> {
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, tenant_id")
    .not("tenant_id", "is", null)
    .eq("is_active", true)
    .neq("id", signIn.id);
  const rows = (data ?? []) as { id: string; full_name: string | null; tenant_id: string }[];
  const found = findAccountMatches(
    { email: signIn.email, fullName: signIn.fullName },
    rows.map((r) => ({ id: r.id, full_name: r.full_name, signedIn: false })),
  );
  const tenantOf = new Map(rows.map((r) => [r.id, r.tenant_id]));
  return Promise.all(
    found.slice(0, 5).map(async (m) => {
      const { data: u } = await admin.auth.admin.getUserById(m.id);
      return { ...m, signedIn: !!u?.user?.last_sign_in_at, tenant_id: tenantOf.get(m.id)! };
    }),
  );
}

async function linkByName(
  admin: SupabaseClient,
  userId: string,
  email: string,
  fullName: string | null,
): Promise<"linked" | "flagged" | "noop"> {
  const matches = await nameMatchesFor(admin, { id: userId, email, fullName });
  if (matches.length === 0) return "noop";

  const exact = matches.filter((m) => m.strength === "exact");
  if (exact.length === 1) {
    const domains = await orgDomains(admin, exact[0].tenant_id);
    const target = autoLinkTarget({ email, fullName }, matches, domains);
    if (target && (await mergeInto(admin, target, userId))) return "linked";
  }

  // Not certain enough: the admins decide, with the likely match named.
  const { data: rows } = await admin
    .from("profiles")
    .select("id, tenant_id, role, manager_id, department, emp_num, employee_type, lunch_eligible, job_title, full_name")
    .in("id", matches.map((m) => m.id));
  await flagForAdmins(admin, userId, email, (rows ?? []) as MatchRow[], true);
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
  byName = false,
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
      body: byName
        ? `${email} signed in for the first time and looks like ${matches.map((m) => m.full_name ?? "an existing account").join(" or ")}. Open Pending access to link them to their existing account.`
        : `${email} signed in via SSO and matches an existing account. Review pending users to grant access or merge.`,
      url: "/admin?view=people",
    })),
  );
}
