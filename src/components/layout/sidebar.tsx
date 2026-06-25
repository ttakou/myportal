import Link from "next/link";
import { LayoutDashboard, FileBarChart } from "lucide-react";
import { getActiveServices } from "@/lib/services";
import { getAccess } from "@/lib/auth";
import { hasDirectReports } from "@/lib/appraisals";
import { offshoreSubmenu } from "@/app/(portal)/offshore/_components/offshore-views";
import { performanceSubmenu } from "@/app/(portal)/performance/_components/performance-views";
import { canteenSubmenu } from "@/app/(portal)/canteen/_components/canteen-views";
import { trainingSubmenu } from "@/app/(portal)/training/_components/training-views";
import { emergencySubmenu } from "@/app/(portal)/emergency/_components/emergency-views";
import { visitorsSubmenu } from "@/app/(portal)/visitors/_components/visitors-views";
import { medicalSubmenu } from "@/app/(portal)/medical/_components/medical-views";
import { savingsSubmenu } from "@/app/(portal)/savings/_components/savings-views";
import { adminSubmenu, canSeeAdminConsole, type AdminFlags } from "@/app/(portal)/admin/_components/admin-views";
import { isTrainingAdmin as getIsTrainingAdmin } from "@/lib/training";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { NavLinks, type NavLink } from "./nav-links";

/**
 * Dynamic, data-driven sidebar (Server Component).
 *
 * It fetches the authenticated user's active `tenant_services` and renders ONLY
 * the modules the tenant is subscribed to. Adding/removing a module for a tenant
 * is a pure data change — no code edits required. The brand name is passed in by
 * the layout from the tenant's resolved branding.
 */
export async function Sidebar({
  brandName,
  logoUrl,
}: {
  brandName?: string;
  logoUrl?: string | null;
}) {
  const [services, access, isManager, isTrainingAdmin, perms] = await Promise.all([
    getActiveServices(),
    getAccess(),
    hasDirectReports(),
    getIsTrainingAdmin(),
    getMyPermissions(),
  ]);
  const canManageOffshore = access.isAdmin || access.isCampboss || access.isOim;
  const isHr = access.isHr || access.isSystemAdmin || access.isAdmin;
  const isOrgAdmin = access.isAdmin || access.isSystemAdmin;
  const canMuster = isOrgAdmin || hasPermission(perms, "visitors", "operate");
  const adminFlags: AdminFlags = {
    isSystemAdmin: access.isSystemAdmin,
    isHr,
    isCanteenManager: access.isCanteenManager,
    isTrainingAdmin,
    canManageOffshore,
    isFinance: access.isFinance,
    isSafetyAdmin: access.isSafetyAdmin,
    isOrgAdmin,
    canMuster,
  };

  let links: NavLink[] = services.map((s) => {
    const base: NavLink = { name: s.name, href: s.route_path, icon: s.icon };
    // Performance: indented submenu (home / my appraisal / team / HR / settings),
    // role-aware. Appraisal views default to "My appraisal".
    if (s.route_path === "/performance") {
      return {
        ...base,
        defaultSubKey: "mine",
        subItems: performanceSubmenu({ isHr, isManager }),
      };
    }
    // Canteen: indented submenu of the module's real routes (menu / history /
    // feedback for everyone, plus serving, management, entitlements and reports
    // per role) — mirrors the gating on each canteen page.
    if (s.route_path === "/canteen") {
      return {
        ...base,
        subItems: canteenSubmenu({
          canServe: access.isCanteenStaff,
          canManage: access.isCanteenManager,
          canEntitle: access.isHr,
          canReport: access.isFinance || access.isCanteenManager,
          isOim: access.isOim,
        }),
      };
    }
    // Offshore: everyone with the module gets an indented submenu (each view on
    // its own); managers additionally get the management views. Everyone lands
    // on "My trips" (the self-service view) by default.
    if (s.route_path === "/offshore") {
      return {
        ...base,
        defaultSubKey: "mytrips",
        subItems: offshoreSubmenu(canManageOffshore).map((v) => ({
          key: v.key,
          label: v.label,
          icon: v.icon,
          href: `/offshore?view=${v.key}`,
        })),
      };
    }
    // Training & Competence: My Training for everyone; Team views for managers;
    // HR Administration + Reports for HR.
    if (s.route_path === "/training") {
      return {
        ...base,
        defaultSubKey: "dashboard",
        subItems: trainingSubmenu({ isManager, isTrainingAdmin }),
      };
    }
    // Admin Console (core service): an indented submenu of the console sections.
    if (s.route_path === "/admin") {
      return { ...base, defaultSubKey: "overview", subItems: adminSubmenu(adminFlags) };
    }
    // Emergency: everyone gets the support view; safety coordinators also get the
    // command centre + incident history.
    if (s.route_path === "/emergency") {
      return { ...base, subItems: emergencySubmenu({ canCommand: access.isSafetyAdmin }) };
    }
    // Visitors: reception view for everyone with the module; the muster roll for
    // admins / security / responders (visitors:operate).
    if (s.route_path === "/visitors") {
      return { ...base, subItems: visitorsSubmenu({ canMuster }) };
    }
    // Medical: the employee's own status, plus an Administration view for admins.
    if (s.route_path === "/medical") {
      return { ...base, defaultSubKey: "mine", subItems: medicalSubmenu({ isAdmin: isOrgAdmin }) };
    }
    // Savings: my savings (balance/loans/ledger), Administration for admins, and
    // the arrears report for finance/admin.
    if (s.route_path === "/savings") {
      return {
        ...base,
        defaultSubKey: "mine",
        subItems: savingsSubmenu({ isAdmin: isOrgAdmin }),
      };
    }
    return base;
  });

  // Merge the two travel modules — "Transportation Request" (/transportation)
  // and "Out of Town Trip" (/out-of-town) — under a single "Transportation"
  // parent with an indented submenu (like Training/Canteen). The parent stays
  // highlighted on either route. Only merges when the tenant has both enabled.
  const transport = links.find((l) => l.href === "/transportation");
  const outOfTown = links.find((l) => l.href === "/out-of-town");
  if (transport && outOfTown) {
    const merged: NavLink = {
      name: "Transportation",
      href: "/transportation",
      icon: transport.icon ?? "Car",
      matchPaths: ["/transportation", "/out-of-town"],
      subItems: [
        { key: "transportation", label: "Transportation Request", icon: transport.icon ?? "Car", href: "/transportation" },
        { key: "out-of-town", label: "Out of Town Trip", icon: outOfTown.icon ?? "Plane", href: "/out-of-town" },
      ],
    };
    links = links.flatMap((l) =>
      l.href === "/transportation" ? [merged] : l.href === "/out-of-town" ? [] : [l],
    );
  }

  // The Admin Console is surfaced via the "core" service for system admins. For
  // module admins (who don't get that service) inject the console link so they
  // can reach their module's administration from one place (tiered access).
  if (!links.some((l) => l.href === "/admin") && canSeeAdminConsole(adminFlags)) {
    links.unshift({
      name: "Admin Console",
      href: "/admin",
      icon: "ShieldCheck",
      defaultSubKey: "overview",
      subItems: adminSubmenu(adminFlags),
    });
  }

  // Reports hub: every user has at least the personal "My meals" report.
  const canSeeReports = true;

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-3 border-b px-6">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={brandName ?? "Logo"}
            className="h-9 w-auto max-w-[180px] object-contain"
          />
        ) : (
          <div className="flex flex-col justify-center">
            <span className="truncate text-lg font-semibold tracking-tight text-brand">
              {brandName ?? "MyEnterprisePortal"}
            </span>
            {brandName && (
              <span className="text-xs text-muted-foreground">
                Employee Self-Service
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto py-4">
        {/* Dashboard is always present, independent of subscriptions. */}
        <div className="px-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span>Dashboard</span>
          </Link>
          {canSeeReports && (
            <Link
              href="/reports"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <FileBarChart className="h-4 w-4 shrink-0" />
              <span>Reports</span>
            </Link>
          )}
        </div>

        {links.length > 0 && (
          <>
            <p className="px-6 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              Modules
            </p>
            <NavLinks links={links} />
          </>
        )}
      </div>
    </aside>
  );
}
