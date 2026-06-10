import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { getActiveServices } from "@/lib/services";
import { NavLinks, type NavLink } from "./nav-links";

/**
 * Dynamic, data-driven sidebar (Server Component).
 *
 * It fetches the authenticated user's active `tenant_services` and renders ONLY
 * the modules the tenant is subscribed to. Adding/removing a module for a tenant
 * is a pure data change — no code edits required.
 */
export async function Sidebar() {
  const services = await getActiveServices();

  const links: NavLink[] = services.map((s) => ({
    name: s.name,
    href: s.route_path,
    icon: s.icon,
  }));

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <span className="text-lg font-semibold tracking-tight">
          MyEnterprisePortal
        </span>
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
