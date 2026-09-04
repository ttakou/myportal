import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  HR_CONSOLE_TABS,
  hrTabHref,
  type HrConsoleTab,
} from "@/lib/performance/hr-console-tabs";

/**
 * The HR console's sub-menu.
 *
 * Plain links, so each tab is a URL that can be bookmarked or sent to a
 * colleague, and the browser's back button does what it always does. The line
 * beneath says what the open tab is for.
 */
export function HrConsoleTabBar({
  current,
  cycleId,
}: {
  current: HrConsoleTab;
  cycleId: string | null;
}) {
  const open = HR_CONSOLE_TABS.find((t) => t.key === current);
  return (
    <nav aria-label="HR console sections" className="space-y-1.5">
      <div className="flex flex-wrap gap-1 border-b">
        {HR_CONSOLE_TABS.map((t) => {
          const active = t.key === current;
          return (
            <Link
              key={t.key}
              href={hrTabHref(t.key, cycleId)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {open && <p className="text-xs text-muted-foreground">{open.description}</p>}
    </nav>
  );
}
