import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TrainingHubTab } from "./training-views";

/**
 * Tab bar for a consolidated training hub. Each tab is a plain link to the
 * original `?view=` key, so the server page renders (and fetches data for)
 * only the active tab, and legacy deep-links keep working unchanged.
 */
export function ViewTabs({ tabs, current }: { tabs: TrainingHubTab[]; current: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="Sub-views">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/training?view=${t.key}`}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
            t.key === current
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
