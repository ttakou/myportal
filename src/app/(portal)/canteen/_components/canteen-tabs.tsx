"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { canteenTabsFor, type CanteenAccess } from "./canteen-views";

/**
 * Tab bar for the current canteen hub. Rendered by the /canteen layout (and the
 * canteen report pages) with the viewer's access flags; picks the hub from the
 * pathname and shows only the routes the user may open. Renders nothing outside
 * a hub or for a single-route hub.
 */
export function CanteenTabs({ access }: { access: CanteenAccess }) {
  const pathname = usePathname();
  const tabs = canteenTabsFor(pathname, access);
  if (tabs.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="Canteen sections">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

