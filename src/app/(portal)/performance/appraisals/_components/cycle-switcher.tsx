import Link from "next/link";
import type { AppraisalCycle } from "@/types/appraisal";

/**
 * Year navigation for appraisals. Renders one chip per cycle (newest first);
 * clicking a year reloads the page for that cycle via the `?cycle=` param so
 * every dashboard panel re-scopes to the selected year. Purely presentational.
 */
export function CycleSwitcher({
  cycles,
  selectedId,
}: {
  cycles: AppraisalCycle[];
  selectedId: string | null;
}) {
  if (cycles.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Appraisal year
      </p>
      <div className="flex flex-wrap gap-2">
        {cycles.map((c) => {
          const selected = c.id === selectedId;
          return (
            <Link
              key={c.id}
              href={`/performance/appraisals?cycle=${c.id}`}
              aria-current={selected ? "page" : undefined}
              title={c.name}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                selected
                  ? "border-primary bg-primary/5 font-medium text-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <span>{c.year}</span>
              {c.status === "active" && (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-green-700">
                  Current
                </span>
              )}
              {c.status === "closed" && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  Closed
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
