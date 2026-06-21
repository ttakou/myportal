"use client";

import { useState } from "react";

/**
 * A native `<select>` that defers rendering its options until first focus.
 *
 * Rendering a large option list (people, rooms, roster, …) for every row of a
 * table is O(rows × options) — with a few hundred entries that is hundreds of
 * thousands of DOM nodes to server-render and hydrate, which can make a page
 * take minutes to open. Until the control is focused we render only the
 * currently-selected option, so the value still displays; the full list is
 * built on demand. Generic over the option type.
 *
 * Deferral only matters for genuinely large lists. A list no longer than
 * `eagerThreshold` is rendered in full immediately, so small dropdowns open
 * instantly with no first-focus build delay — exactly as a plain `<select>`.
 */
export function LazySelect<T>({
  value,
  options,
  getOptionValue,
  getOptionLabel,
  placeholder = "—",
  disabled,
  className,
  eagerThreshold = 50,
  onChange,
}: {
  value: string | null;
  options: readonly T[];
  getOptionValue: (option: T) => string;
  getOptionLabel: (option: T) => string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  eagerThreshold?: number;
  onChange: (value: string | null) => void;
}) {
  // Short lists are cheap to render — populate them immediately so the first
  // open is instant; only defer when the list is big enough to be worth it.
  const [ready, setReady] = useState(options.length <= eagerThreshold);
  const selected = options.find((o) => getOptionValue(o) === value);
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onFocus={() => setReady(true)}
      onChange={(e) => onChange(e.target.value || null)}
      className={className}
    >
      <option value="">{placeholder}</option>
      {ready
        ? options.map((o) => (
            <option key={getOptionValue(o)} value={getOptionValue(o)}>
              {getOptionLabel(o)}
            </option>
          ))
        : selected && (
            <option value={getOptionValue(selected)}>{getOptionLabel(selected)}</option>
          )}
    </select>
  );
}
