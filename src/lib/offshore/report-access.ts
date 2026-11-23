import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { getAccess } from "@/lib/auth";

/**
 * Who may open the monthly offshore report: admins, the OIM, the Campboss,
 * the Dispatcher, Finance — and holders of the "Operations Supervisor" access
 * role. That role's offshore permissions are the same as every staff
 * member's (view, create), so it is recognised by name.
 */
export const MONTHLY_REPORT_ROLE_NAMES = ["operations supervisor"];

export async function canOpenMonthlyReport(access: Awaited<ReturnType<typeof getAccess>>): Promise<boolean> {
  if (access.isAdmin || access.isOim || access.isCampboss || access.isDispatcher || access.isFinance) return true;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("profile_access_roles")
    .select("tenant_roles(name)")
    .eq("profile_id", user.id);
  return ((data ?? []) as { tenant_roles: unknown }[]).some((row) => {
    const role = (Array.isArray(row.tenant_roles) ? row.tenant_roles[0] : row.tenant_roles) as { name?: string } | null;
    return MONTHLY_REPORT_ROLE_NAMES.includes((role?.name ?? "").trim().toLowerCase());
  });
}
