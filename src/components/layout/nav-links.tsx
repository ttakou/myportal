"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { icons, ChevronRight, LayoutDashboard, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavSubItem {
  /** matches the `?view=` value */
  key: string;
  label: string;
  icon: string;
  href: string;
  /** Optional section heading to group items under within the submenu. */
  section?: string;
  /** Extra `?view=` values that also mark this item active (e.g. a hub's tabs). */
  matchViews?: string[];
}

export interface NavLink {
  name: string;
  href: string;
  icon: string | null;
  /** Optional indented submenu, shown when the link is active. */
  subItems?: NavSubItem[];
  /** Default sub-view to highlight when no `?view=` is present. */
  defaultSubKey?: string;
  /** Extra path prefixes that also mark this link active (for merged menus that
   *  span more than one route, e.g. Transportation = /transportation + /out-of-town). */
  matchPaths?: string[];
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
        const matchesPath = (p: string) => pathname === p || pathname.startsWith(p + "/");
        const active =
          matchesPath(link.href) || (link.matchPaths?.some(matchesPath) ?? false);
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

  const isActive = (href: string, matchViews?: string[]) => {
    const [path, qs] = href.split("?");
    const itemView = qs ? new URLSearchParams(qs).get("view") : null;
    if (pathname !== path) return false;
    if (!itemView) return true;
    const view = currentView ?? defaultKey;
    return view === itemView || (view != null && (matchViews ?? []).includes(view));
  };

  const renderLink = (si: NavSubItem) => {
    const SubIcon = resolveIcon(si.icon);
    const isCurrent = isActive(si.href, si.matchViews);
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
  };

  // Group consecutive items by section. Items without a section render plainly
  // (other modules); sectioned groups get a clickable, foldable header.
  const groups: { section?: string; items: NavSubItem[] }[] = [];
  for (const si of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === si.section) last.items.push(si);
    else groups.push({ section: si.section, items: [si] });
  }
  const sectioned = groups.some((g) => g.section);

  // Foldable sections start collapsed, except the one holding the active item
  // (so you always see where you are). Falls back to opening the first section.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    if (!sectioned) return {};
    const activeSection = groups.find((g) => g.section && g.items.some((si) => isActive(si.href, si.matchViews)))?.section;
    const firstSection = groups.find((g) => g.section)?.section;
    const target = activeSection ?? firstSection;
    return target ? { [target]: true } : {};
  });

  return (
    <div className="mb-1 ml-5 mt-0.5 flex flex-col gap-0.5 border-l pl-2">
      {groups.map((g, i) => {
        if (!g.section) return <div key={`u${i}`} className="flex flex-col gap-0.5">{g.items.map(renderLink)}</div>;
        const isOpen = open[g.section] ?? false;
        const count = g.items.length;
        return (
          <div key={g.section} className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [g.section!]: !isOpen }))}
              className="flex w-full items-center gap-1 rounded-md px-2.5 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors first:pt-0.5 hover:text-foreground"
            >
              <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-90")} />
              <span className="truncate">{g.section}</span>
              {!isOpen && <span className="ml-auto text-muted-foreground/50">{count}</span>}
            </button>
            {isOpen && <div className="flex flex-col gap-0.5">{g.items.map(renderLink)}</div>}
          </div>
        );
      })}
    </div>
  );
}
