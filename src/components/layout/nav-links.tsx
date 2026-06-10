"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { icons, LayoutDashboard, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavLink {
  name: string;
  href: string;
  icon: string | null;
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
          <Link
            key={link.href}
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
        );
      })}
    </nav>
  );
}
