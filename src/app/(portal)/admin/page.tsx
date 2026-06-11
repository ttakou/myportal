import Link from "next/link";
import { ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getTenantUsers, getTenantModules } from "@/lib/admin";
import { getServedMealPeriods } from "@/lib/canteen";
import { UsersPanel } from "./_components/users-panel";
import { ModulesPanel } from "./_components/modules-panel";
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

  const [users, modules] = await Promise.all([
    getTenantUsers(),
    getTenantModules(),
  ]);
  const canteenActive = modules.some((m) => m.slug === "canteen" && m.is_active);
  const servedMeals =
    canteenActive && access.isCanteenManager ? await getServedMealPeriods() : [];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="text-muted-foreground">
          Manage your organization&apos;s modules and people.
        </p>
      </div>

      {access.isSystemAdmin && <ModulesPanel modules={modules} />}
      {canteenActive && access.isCanteenManager && (
        <CanteenSettingsPanel served={servedMeals} />
      )}
      <UsersPanel users={users} canAssignRoles={access.isHr} />
    </div>
  );
}
