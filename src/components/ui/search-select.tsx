"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { filterOptions } from "@/lib/option-filter";

/**
 * A type-to-filter picker with the same contract as `LazySelect`.
 *
 * A native `<select>` only jumps to whatever matches the first letters typed,
 * which is unusable for picking one person out of a few hundred. This renders a
 * text input plus a popup list filtered on every keystroke, matching anywhere in
 * the label so "kom" finds "KOM KOM" and "Door 3 — Nkodo".
 *
 * Options are only built while the popup is open, so a page with one picker per
 * table row stays as cheap to render as it was with the deferred `<select>`.
 * Generic over the option type.
 */
export function SearchSelect<T>({
  value,
  options,
  getOptionValue,
  getOptionLabel,
  placeholder = "—",
  disabled,
  className,
  wrapperClassName,
  maxVisible = 50,
  onChange,
}: {
  value: string | null;
  options: readonly T[];
  getOptionValue: (option: T) => string;
  getOptionLabel: (option: T) => string;
  placeholder?: string;
  disabled?: boolean;
  /** Class for the text input itself. */
  className?: string;
  /** Class for the positioning wrapper — use for flex sizing (`flex-1`). */
  wrapperClassName?: string;
  /** Cap on rows rendered at once; typing narrows past it. */
  maxVisible?: number;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => getOptionValue(o) === value);
  const selectedLabel = selected ? getOptionLabel(selected) : "";

  // Filter only while open — closed pickers cost nothing.
  const { matches, total } = useMemo(() => {
    if (!open) return { matches: [] as T[], total: 0 };
    return filterOptions(options, q, getOptionLabel, maxVisible);
    // getOptionLabel is a fresh closure on every render; the list and the query
    // are what actually change the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, options, maxVisible]);

  useEffect(() => setActive(0), [q, open]);

  // Every close drops the query, so the next open starts from the full list and
  // the input falls back to showing the current selection. Leaving it behind
  // makes a reopened picker read as "No match" against a name it never sees.
  function close() {
    setOpen(false);
    setQ("");
  }

  // Close when a click lands outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(option: T) {
    onChange(getOptionValue(option) || null);
    close();
  }

  return (
    <div ref={wrapRef} className={cn("relative", wrapperClassName)}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        // Closed, the input shows the current selection; open, it is the query box.
        value={open ? q : selectedLabel}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        // A click outside closes the list but can leave the input focused, so
        // focus alone would not reopen it.
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && matches[active]) {
              e.preventDefault();
              choose(matches[active]);
            }
          } else if (e.key === "Escape") {
            close();
          } else if (e.key === "Tab") {
            close();
          } else if (e.key === "Backspace" && !q && value) {
            // Backspace on an empty query clears the current selection.
            onChange(null);
          }
        }}
        className={className}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-0.5 max-h-56 w-full min-w-[12rem] overflow-auto rounded-md border bg-popover p-0.5 text-xs shadow-md"
        >
          {matches.map((o, i) => {
            const v = getOptionValue(o);
            return (
              <li
                key={v}
                role="option"
                aria-selected={v === value}
                // mousedown, not click: the input's blur would close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "cursor-pointer truncate rounded px-2 py-1",
                  i === active && "bg-accent text-accent-foreground",
                  v === value && "font-semibold",
                )}
              >
                {getOptionLabel(o)}
              </li>
            );
          })}
          {matches.length === 0 && (
            <li className="px-2 py-1 text-muted-foreground">No match</li>
          )}
          {total > matches.length && (
            <li className="px-2 py-1 text-[10px] text-muted-foreground">
              {total - matches.length} more — keep typing to narrow
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
