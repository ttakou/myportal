import Link from "next/link";
import { ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getTenantUsers, getTenantModules } from "@/lib/admin";
import { getAccessRoles } from "@/lib/access-roles";
import { getCanteenCutoff, getServedMealPeriods } from "@/lib/canteen";
import { UsersPanel } from "./_components/users-panel";
import { ModulesPanel } from "./_components/modules-panel";
import { ModuleParamsPanel } from "./_components/module-params-panel";
import { RolesPanel } from "./_components/roles-panel";
import { CanteenSettingsPanel } from "./_components/canteen-settings-panel";

export default async function AdminPage() {
  const access = await getAccess();

  if (!access.isHr && !access.isSystemAdmin) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Administrators only</h1>
        <p className="text-muted-foreground">
          The admin console is available to HR and system administrators.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const [users, modules, accessRoles] = await Promise.all([
    getTenantUsers(),
    getTenantModules(),
    getAccessRoles(),
  ]);
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
      </div>

      {access.isSystemAdmin && <ModulesPanel modules={modules} />}
      {access.isSystemAdmin && <RolesPanel roles={accessRoles} modules={modules} />}
      {access.isSystemAdmin && <ModuleParamsPanel modules={modules} />}
      {showCanteen && <CanteenSettingsPanel served={servedMeals} cutoffHour={cutoffHour} />}
      <UsersPanel
        users={users}
        canAssignRoles={access.isHr}
        accessRoles={access.isSystemAdmin ? accessRoles : []}
      />
    </div>
  );
}
