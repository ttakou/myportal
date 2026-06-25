import Link from "next/link";
import { ShieldX, BarChart3, icons, LayoutDashboard, ArrowRight } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTenantUsers, getTenantModules, getImpersonationLog } from "@/lib/admin";
import { getAccessRoles } from "@/lib/access-roles";
import { getActiveServices } from "@/lib/services";
import { getTenantBranding } from "@/lib/branding";
import { getCanteenCutoff, getServedMealPeriods } from "@/lib/canteen";
import { isTrainingAdmin as getIsTrainingAdmin } from "@/lib/training";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { UsersPanel } from "./_components/users-panel";
import { AuditLogPanel } from "./_components/audit-log-panel";
import { ModulesPanel } from "./_components/modules-panel";
import { ModuleParamsPanel } from "./_components/module-params-panel";
import { RolesPanel } from "./_components/roles-panel";
import { RegisterStaffPanel } from "./_components/register-staff-panel";
import { BulkImportPanel } from "./_components/bulk-import-panel";
import { BrandingPanel } from "./_components/branding-panel";
import { CanteenSettingsPanel } from "./_components/canteen-settings-panel";
import {
  canSeeAdminConsole,
  moduleAdminLinks,
  resolveAdminView,
  type AdminFlags,
} from "./_components/admin-views";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (name in icons ? icons[name as keyof typeof icons] : LayoutDashboard);
  return <C className={className} />;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const access = await getAccess();
  const [isTrainingAdmin, perms] = await Promise.all([getIsTrainingAdmin(), getMyPermissions()]);

  const flags: AdminFlags = {
    isSystemAdmin: access.isSystemAdmin,
    isHr: access.isHr,
    isCanteenManager: access.isCanteenManager,
    isTrainingAdmin,
    canManageOffshore: access.isAdmin || access.isCampboss || access.isOim,
    isFinance: access.isFinance,
    isSafetyAdmin: access.isSafetyAdmin,
    isOrgAdmin: access.isAdmin || access.isSystemAdmin,
    canMuster: access.isAdmin || access.isSystemAdmin || hasPermission(perms, "visitors", "operate"),
  };

  if (!canSeeAdminConsole(flags)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Administrators only</h1>
        <p className="text-muted-foreground">
          The admin console is available to administrators and module managers.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const view = resolveAdminView((await searchParams).view, flags);

  const TITLES: Record<typeof view, { title: string; subtitle: string }> = {
    overview: { title: "Admin Console", subtitle: "One place to administer every module." },
    people: { title: "People", subtitle: "Users, roles, staff registration and bulk import." },
    roles: { title: "Access Roles", subtitle: "Who can see and do what, per module." },
    modules: { title: "Modules", subtitle: "Enable modules and set their parameters." },
    settings: { title: "Settings & Branding", subtitle: "Tenant branding and module settings." },
    audit: { title: "Audit Log", subtitle: "A record of sensitive administrative actions." },
  };
  const head = TITLES[view];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{head.title}</h1>
        <p className="text-muted-foreground">{head.subtitle}</p>
      </div>
      {view === "overview" && <Overview flags={flags} />}
      {view === "people" && <PeopleView flags={flags} />}
      {view === "roles" && <RolesView />}
      {view === "modules" && <ModulesView />}
      {view === "settings" && <SettingsView flags={flags} />}
      {view === "audit" && <AuditLogPanel />}
    </div>
  );
}

// --- Overview (the hub) -----------------------------------------------------

const CORE_CARDS: { view: string; label: string; description: string; icon: string }[] = [
  { view: "people", label: "People", description: "Users, roles & onboarding", icon: "Users" },
  { view: "roles", label: "Access Roles", description: "Permissions per module", icon: "ShieldCheck" },
  { view: "modules", label: "Modules", description: "Enable & parameterise modules", icon: "Boxes" },
  { view: "settings", label: "Settings & Branding", description: "Tenant branding & settings", icon: "Settings" },
  { view: "audit", label: "Audit Log", description: "Sensitive admin actions", icon: "ScrollText" },
];

async function Overview({ flags }: { flags: AdminFlags }) {
  const services = await getActiveServices();
  const activeSlugs = services.map((s) => s.slug);
  const modules = moduleAdminLinks(flags, activeSlugs);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Link href="/analytics" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
          <BarChart3 className="h-4 w-4" /> Executive dashboard
        </Link>
        <Link href="/reports/access-review" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
          <BarChart3 className="h-4 w-4" /> Access review report
        </Link>
      </div>

      {flags.isSystemAdmin && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Core administration</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CORE_CARDS.map((c) => (
              <Link
                key={c.view}
                href={`/admin?view=${c.view}`}
                className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <span className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon name={c.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{c.label}</p>
                  <p className="text-sm text-muted-foreground">{c.description}</p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Module administration</h2>
        {modules.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No module admin areas available to you.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <Link
                key={m.key}
                href={m.href}
                className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <span className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon name={m.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{m.label}</p>
                  <p className="text-sm text-muted-foreground">{m.description}</p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// --- People -----------------------------------------------------------------

async function PeopleView({ flags }: { flags: AdminFlags }) {
  const canImpersonate = flags.isOrgAdmin;
  const [users, accessRoles, me, impersonationLog] = await Promise.all([
    getTenantUsers(),
    getAccessRoles(),
    createClient().auth.getUser().then((r) => r.data.user),
    canImpersonate ? getImpersonationLog() : Promise.resolve([]),
  ]);
  const selfId = me?.id ?? "";

  return (
    <div className="space-y-8">
      {flags.isHr && (
        <RegisterStaffPanel managers={users.filter((u) => u.is_active)} accessRoles={accessRoles} />
      )}
      {flags.isHr && <BulkImportPanel />}
      <UsersPanel
        users={users}
        canAssignRoles={flags.isHr}
        accessRoles={flags.isSystemAdmin ? accessRoles : []}
        canImpersonate={canImpersonate}
        selfId={selfId}
      />
      {canImpersonate && <ImpersonationLog rows={impersonationLog} />}
    </div>
  );
}

function ImpersonationLog({ rows }: { rows: Awaited<ReturnType<typeof getImpersonationLog>> }) {
  return (
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
            {rows.map((e) => (
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
            {rows.length === 0 && (
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
  );
}

// --- Roles ------------------------------------------------------------------

async function RolesView() {
  const [accessRoles, modules, users] = await Promise.all([
    getAccessRoles(),
    getTenantModules(),
    getTenantUsers(),
  ]);
  return <RolesPanel roles={accessRoles} modules={modules} users={users} />;
}

// --- Modules ----------------------------------------------------------------

async function ModulesView() {
  const modules = await getTenantModules();
  return (
    <div className="space-y-8">
      <ModulesPanel modules={modules} />
      <ModuleParamsPanel modules={modules} />
    </div>
  );
}

// --- Settings & branding ----------------------------------------------------

async function SettingsView({ flags }: { flags: AdminFlags }) {
  const [branding, modules] = await Promise.all([getTenantBranding(), getTenantModules()]);
  const canteenActive = modules.some((m) => m.slug === "canteen" && m.is_active);
  const showCanteen = canteenActive && flags.isCanteenManager;
  const [served, cutoffHour] = showCanteen
    ? await Promise.all([getServedMealPeriods(), getCanteenCutoff()])
    : [[], null];
  return (
    <div className="space-y-8">
      <BrandingPanel branding={branding} />
      {showCanteen && <CanteenSettingsPanel served={served} cutoffHour={cutoffHour} />}
    </div>
  );
}
