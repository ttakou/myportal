"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const input = "rounded-md border bg-background px-2 py-1.5 text-sm";

/**
 * One extra filter for a report's filter bar, kept in the URL query like the
 * shared filters so the report re-runs on the server. The first option is the
 * default and leaves the parameter out of the URL.
 */
export function ParamSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(name) ?? options[0]?.value ?? "";

  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <select
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === options[0]?.value) next.delete(name);
          else next.set(name, e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
        className={`mt-1 block ${input}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
