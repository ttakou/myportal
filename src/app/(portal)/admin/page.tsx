import Link from "next/link";
import { ShieldX, BarChart3 } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTenantUsers, getTenantModules, getImpersonationLog } from "@/lib/admin";
import { getAccessRoles } from "@/lib/access-roles";
import { getTenantBranding } from "@/lib/branding";
import { getCanteenCutoff, getServedMealPeriods } from "@/lib/canteen";
import { UsersPanel } from "./_components/users-panel";
import { AuditLogPanel } from "./_components/audit-log-panel";
import { ModulesPanel } from "./_components/modules-panel";
import { ModuleParamsPanel } from "./_components/module-params-panel";
import { RolesPanel } from "./_components/roles-panel";
import { RegisterStaffPanel } from "./_components/register-staff-panel";
import { BulkImportPanel } from "./_components/bulk-import-panel";
import { BrandingPanel } from "./_components/branding-panel";
import { CanteenSettingsPanel } from "./_components/canteen-settings-panel";

export default async function AdminPage() {
  const access = await getAccess();

  if (!access.isSystemAdmin) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Administrators only</h1>
        <p className="text-muted-foreground">
          The admin console is available to system administrators.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const [users, modules, accessRoles, branding, me] = await Promise.all([
    getTenantUsers(),
    getTenantModules(),
    getAccessRoles(),
    getTenantBranding(),
    createClient().auth.getUser().then((r) => r.data.user),
  ]);
  const selfId = me?.id ?? "";
  // Tenant + super admins can impersonate non-admin users within their tenant.
  const canImpersonate = access.isAdmin;
  const impersonationLog = canImpersonate ? await getImpersonationLog() : [];
  const canteenActive = modules.some((m) => m.slug === "canteen" && m.is_active);
  const showCanteen = canteenActive && access.isCanteenManager;
  const servedMeals = showCanteen ? await getServedMealPeriods() : [];
  const cutoffHour = showCanteen ? await getCanteenCutoff() : null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="text-muted-foreground">
          Manage your organization&apos;s modules and people.
        </p>
        <Link href="/analytics" className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
          <BarChart3 className="h-4 w-4" /> Executive dashboard
        </Link>
      </div>

      {access.isSystemAdmin && <BrandingPanel branding={branding} />}
      {access.isSystemAdmin && <ModulesPanel modules={modules} />}
      {access.isSystemAdmin && (
        <RolesPanel roles={accessRoles} modules={modules} users={users} />
      )}
      {access.isSystemAdmin && <ModuleParamsPanel modules={modules} />}
      {showCanteen && <CanteenSettingsPanel served={servedMeals} cutoffHour={cutoffHour} />}
      {access.isHr && (
        <RegisterStaffPanel
          managers={users.filter((u) => u.is_active)}
          accessRoles={accessRoles}
        />
      )}
      {access.isHr && <BulkImportPanel />}
      <UsersPanel
        users={users}
        canAssignRoles={access.isHr}
        accessRoles={access.isSystemAdmin ? accessRoles : []}
        canImpersonate={canImpersonate}
        selfId={selfId}
      />
      {canImpersonate && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Impersonation log</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">When (UTC)</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Admin</th>
                  <th className="px-4 py-2 font-medium">Acted as</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {impersonationLog.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("en-GB", { timeZone: "UTC" })}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          e.action === "start"
                            ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {e.action === "start" ? "Started" : "Stopped"}
                      </span>
                    </td>
                    <td className="px-4 py-2">{e.actor_name ?? "—"}</td>
                    <td className="px-4 py-2">{e.target_name ?? "—"}</td>
                  </tr>
                ))}
                {impersonationLog.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No impersonation events yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {access.isSystemAdmin && <AuditLogPanel />}
    </div>
  );
}
