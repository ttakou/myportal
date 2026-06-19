import Link from "next/link";
import { LayoutDashboard, FileBarChart } from "lucide-react";
import { getActiveServices } from "@/lib/services";
import { getAccess } from "@/lib/auth";
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
  const [services, access] = await Promise.all([getActiveServices(), getAccess()]);

  const links: NavLink[] = services.map((s) => ({
    name: s.name,
    href: s.route_path,
    icon: s.icon,
  }));

  // Reports hub: visible to roles that can see at least one report today.
  const canSeeReports =
    access.isSystemAdmin ||
    access.isAdmin ||
    access.isSafetyAdmin ||
    access.isOim ||
    access.isFinance ||
    access.isHr ||
    access.isCanteenManager;

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
