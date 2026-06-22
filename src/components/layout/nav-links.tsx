"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { icons, LayoutDashboard, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavSubItem {
  /** matches the `?view=` value */
  key: string;
  label: string;
  icon: string;
  href: string;
}

export interface NavLink {
  name: string;
  href: string;
  icon: string | null;
  /** Optional indented submenu, shown when the link is active. */
  subItems?: NavSubItem[];
  /** Default sub-view to highlight when no `?view=` is present. */
  defaultSubKey?: string;
}

function resolveIcon(name: string | null): LucideIcon {
  if (name && name in icons) {
    return icons[name as keyof typeof icons];
  }
  return LayoutDashboard;
}

/**
 * Client component: renders the nav links and highlights the active one.
 * The list itself is computed on the server (data-driven from tenant_services).
 * A link may carry an indented `subItems` submenu (e.g. the offshore module),
 * shown only while that link is active and driven by the `?view=` query param.
 */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {links.map((link) => {
        const Icon = resolveIcon(link.icon);
        const active =
          pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <div key={link.href}>
            <Link
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{link.name}</span>
            </Link>

            {link.subItems && active && (
              <Suspense fallback={null}>
                <SubMenu items={link.subItems} defaultKey={link.defaultSubKey} />
              </Suspense>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Indented submenu. Items may be plain routes (e.g. /performance/settings) or
 * `?view=`-driven views on a shared route (e.g. /offshore?view=manifests). The
 * active item is matched by pathname + view, falling back to `defaultKey` for
 * the view that's shown when a shared route is opened without a `?view=`.
 */
function SubMenu({ items, defaultKey }: { items: NavSubItem[]; defaultKey?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view");

  const isActive = (href: string) => {
    const [path, qs] = href.split("?");
    const itemView = qs ? new URLSearchParams(qs).get("view") : null;
    if (pathname !== path) return false;
    if (!itemView) return true;
    return (currentView ?? defaultKey) === itemView;
  };

  return (
    <div className="mb-1 ml-5 mt-0.5 flex flex-col gap-0.5 border-l pl-2">
      {items.map((si) => {
        const SubIcon = resolveIcon(si.icon);
        const isCurrent = isActive(si.href);
        return (
          <Link
            key={si.key}
            href={si.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              isCurrent
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
            )}
          >
            <SubIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{si.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
