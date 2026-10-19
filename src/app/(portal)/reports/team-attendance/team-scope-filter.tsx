"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LazySelect } from "@/components/ui/lazy-select";

const input = "rounded-md border bg-background px-2 py-1.5 text-sm";

/**
 * The team report's own filters: direct reports only or the whole line below,
 * and — for administrators — whose line to read.
 */
export function TeamScopeFilter({ managers }: { managers: { id: string; name: string }[] | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // A different line has different people in it.
    if (key === "manager") next.delete("user");
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <>
      {managers && (
        <label className="text-xs text-muted-foreground">
          Line of
          <div className="mt-1">
            <LazySelect
              value={params.get("manager")}
              options={managers}
              getOptionValue={(m) => m.id}
              getOptionLabel={(m) => m.name}
              placeholder="Me"
              className={`block ${input}`}
              onChange={(v) => setParam("manager", v)}
            />
          </div>
        </label>
      )}
      <label className="text-xs text-muted-foreground">
        Reports
        <select
          value={params.get("scope") === "direct" ? "direct" : "all"}
          onChange={(e) => setParam("scope", e.target.value === "direct" ? "direct" : null)}
          className={`mt-1 block ${input}`}
        >
          <option value="all">Everyone below</option>
          <option value="direct">Direct reports only</option>
        </select>
      </label>
    </>
  );
}
