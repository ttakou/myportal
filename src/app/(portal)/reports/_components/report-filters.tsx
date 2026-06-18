"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LazySelect } from "@/components/ui/lazy-select";

/**
 * Shared report filter bar. Reports opt into the filters that fit their context
 * via `show`: a period (start/end date), a department, and/or a user. Selections
 * are written to the URL query so the (server-rendered) report re-runs scoped to
 * them — which also makes a filtered report shareable/bookmarkable.
 */
export function ReportFilters({
  show,
  departments = [],
  users = [],
  cycles = [],
  from,
  to,
}: {
  show: { period?: boolean; department?: boolean; user?: boolean; cycle?: boolean };
  departments?: string[];
  users?: { id: string; name: string }[];
  cycles?: { id: string; name: string }[];
  /** Effective period values (e.g. the page's defaults when the URL is empty). */
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const input = "rounded-md border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      {show.cycle && cycles.length > 0 && (
        <label className="text-xs text-muted-foreground">
          Cycle
          <select
            value={params.get("cycle") ?? cycles[0]?.id ?? ""}
            onChange={(e) => setParam("cycle", e.target.value || null)}
            className={`mt-1 block ${input}`}
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {show.period && (
        <>
          <label className="text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={params.get("from") ?? from ?? ""}
              onChange={(e) => setParam("from", e.target.value || null)}
              className={`mt-1 block ${input}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={params.get("to") ?? to ?? ""}
              onChange={(e) => setParam("to", e.target.value || null)}
              className={`mt-1 block ${input}`}
            />
          </label>
        </>
      )}

      {show.department && departments.length > 0 && (
        <label className="text-xs text-muted-foreground">
          Department
          <select
            value={params.get("department") ?? ""}
            onChange={(e) => setParam("department", e.target.value || null)}
            className={`mt-1 block ${input}`}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}

      {show.user && users.length > 0 && (
        <label className="text-xs text-muted-foreground">
          Person
          <div className="mt-1">
            <LazySelect
              value={params.get("user")}
              options={users}
              getOptionValue={(u) => u.id}
              getOptionLabel={(u) => u.name}
              placeholder="Everyone"
              className={`block ${input}`}
              onChange={(v) => setParam("user", v)}
            />
          </div>
        </label>
      )}

      <button
        type="button"
        onClick={() => router.push(pathname)}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        Reset
      </button>
    </div>
  );
}
