"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "staff", label: "Staff" },
  { value: "contractor", label: "Contractors" },
  { value: "visitor", label: "Visitors" },
] as const;

/**
 * Population selector for the Access Register — styled to sit inside the shared
 * ReportFilters bar. Written to the URL query like the other filters so the
 * server-rendered register re-runs scoped to it (and stays shareable).
 */
export function PopulationFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="text-xs text-muted-foreground">
      Population
      <select
        value={params.get("population") ?? "all"}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "all") next.delete("population");
          else next.set("population", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
