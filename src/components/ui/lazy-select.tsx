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
 */
export function LazySelect<T>({
  value,
  options,
  getOptionValue,
  getOptionLabel,
  placeholder = "—",
  disabled,
  className,
  onChange,
}: {
  value: string | null;
  options: readonly T[];
  getOptionValue: (option: T) => string;
  getOptionLabel: (option: T) => string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: string | null) => void;
}) {
  const [ready, setReady] = useState(false);
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
