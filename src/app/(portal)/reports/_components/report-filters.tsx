"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LazySelect } from "@/components/ui/lazy-select";

const PRESETS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "quarterly", label: "This quarter" },
  { value: "yearly", label: "This year" },
  { value: "custom", label: "Custom range" },
] as const;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Resolve a preset to a {from,to} range relative to today, or null for custom. */
function presetRange(preset: string): { from: string; to: string } | null {
  const today = new Date();
  const to = isoDate(today);
  switch (preset) {
    case "daily":
      return { from: to, to };
    case "weekly": {
      const d = new Date(today);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
      return { from: isoDate(d), to };
    }
    case "monthly":
      return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to };
    case "quarterly":
      return { from: isoDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)), to };
    case "yearly":
      return { from: isoDate(new Date(today.getFullYear(), 0, 1)), to };
    default:
      return null;
  }
}

/**
 * Shared report filter bar. Reports opt into the filters that fit their context
 * via `show`: a period (with daily/weekly/monthly/quarterly/yearly/custom
 * presets and start/end dates), a cycle, a department and/or a person.
 * Selections are written to the URL query so the (server-rendered) report
 * re-runs scoped to them — which also makes a filtered report shareable.
 */
export function ReportFilters({
  show,
  departments = [],
  users = [],
  cycles = [],
  accessRoles = [],
  from,
  to,
}: {
  show: {
    period?: boolean;
    department?: boolean;
    user?: boolean;
    cycle?: boolean;
    accessRole?: boolean;
  };
  departments?: string[];
  users?: { id: string; name: string }[];
  cycles?: { id: string; name: string }[];
  accessRoles?: string[];
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next.toString()}`);
  };
  const setParam = (key: string, value: string | null) => setParams({ [key]: value });

  const onPreset = (preset: string) => {
    const range = presetRange(preset);
    if (range) setParams({ preset, from: range.from, to: range.to });
    else setParams({ preset: "custom" });
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
            Period
            <select
              value={params.get("preset") ?? "custom"}
              onChange={(e) => onPreset(e.target.value)}
              className={`mt-1 block ${input}`}
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={params.get("from") ?? from ?? ""}
              onChange={(e) => setParams({ from: e.target.value || null, preset: "custom" })}
              className={`mt-1 block ${input}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={params.get("to") ?? to ?? ""}
              onChange={(e) => setParams({ to: e.target.value || null, preset: "custom" })}
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

      {show.accessRole && accessRoles.length > 0 && (
        <label className="text-xs text-muted-foreground">
          Access role
          <select
            value={params.get("accessRole") ?? ""}
            onChange={(e) => setParam("accessRole", e.target.value || null)}
            className={`mt-1 block ${input}`}
          >
            <option value="">All access roles</option>
            {accessRoles.map((r) => (
              <option key={r} value={r}>
                {r}
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
