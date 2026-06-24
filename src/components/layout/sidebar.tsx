import Link from "next/link";
import { LayoutDashboard, FileBarChart } from "lucide-react";
import { getActiveServices } from "@/lib/services";
import { getAccess } from "@/lib/auth";
import { hasDirectReports } from "@/lib/appraisals";
import { offshoreSubmenu } from "@/app/(portal)/offshore/_components/offshore-views";
import { performanceSubmenu } from "@/app/(portal)/performance/_components/performance-views";
import { canteenSubmenu } from "@/app/(portal)/canteen/_components/canteen-views";
import { trainingSubmenu } from "@/app/(portal)/training/_components/training-views";
import { isTrainingAdmin as getIsTrainingAdmin } from "@/lib/training";
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
  const [services, access, isManager, isTrainingAdmin] = await Promise.all([
    getActiveServices(),
    getAccess(),
    hasDirectReports(),
    getIsTrainingAdmin(),
  ]);
  const canManageOffshore = access.isAdmin || access.isCampboss || access.isOim;
  const isHr = access.isHr || access.isSystemAdmin || access.isAdmin;

  const links: NavLink[] = services.map((s) => {
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
    return base;
  });

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
