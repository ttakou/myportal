"use client";

import { Children, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type RevealOptions = {
  /** Rows shown before the first reveal. */
  initial?: number;
  /** Rows added per reveal (button click or scroll). */
  step?: number;
  /**
   * Lists no longer than this render in full — capping a handful of rows only
   * costs a "Show more" click and a layout shift while saving no meaningful DOM.
   * The progressive window only engages once a list is genuinely long.
   */
  threshold?: number;
  /** Change this (e.g. a search query) to collapse back to `initial`. */
  resetKey?: unknown;
};

/**
 * Caps how many items of a long list are rendered, revealing more on demand.
 *
 * Rendering hundreds of rows (and any per-row controls) up front is slow to
 * paint and hydrate. This shows `initial` rows, then grows by `step` when the
 * user clicks "Show more" or scrolls the sentinel into view. The data itself is
 * still in memory — this trims the DOM, which is the expensive part — so search
 * and counts stay accurate. Pass `resetKey` (the active filter) so a new search
 * starts from the top again.
 */
export function useProgressiveReveal(
  total: number,
  { initial = 10, step = 10, threshold = 30, resetKey }: RevealOptions = {},
) {
  // Below the threshold, show everything up front so small lists behave exactly
  // as they did before (no "Show more", no scroll reveal, no pop-in).
  const floor = total <= threshold ? total : initial;
  const [count, setCount] = useState(floor);

  // Collapse back to the first page when the filter changes — or when the list
  // shrinks under the threshold and should render in full again.
  useEffect(() => {
    setCount(floor);
  }, [resetKey, floor]);

  const effective = Math.min(count, total);
  const hasMore = effective < total;
  const showMore = useCallback(() => setCount((c) => c + step), [step]);

  // Auto-reveal as the sentinel (rendered just below the list) nears the viewport.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setCount((c) => c + step);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, step, total]);

  return { count: effective, hasMore, remaining: total - effective, showMore, sentinelRef };
}

/**
 * The "Show more" affordance for {@link useProgressiveReveal}. Render it right
 * after the list; it doubles as the scroll sentinel that auto-loads the next
 * page. Renders nothing once everything is shown. Safe below a `<table>`.
 */
export const ShowMore = forwardRef<
  HTMLDivElement,
  { hasMore: boolean; remaining: number; onClick: () => void; label?: string; className?: string }
>(function ShowMore({ hasMore, remaining, onClick, label = "Show more", className }, ref) {
  if (!hasMore) return null;
  return (
    <div ref={ref} className={className ?? "flex justify-center pt-2"}>
      <Button type="button" variant="outline" size="sm" onClick={onClick}>
        {label} ({remaining} more)
      </Button>
    </div>
  );
});

/**
 * Drop-in replacement for a `<tbody>` that caps how many rows are rendered.
 *
 * Pass the rows you would have put inside `<tbody>` (typically
 * `report.rows.map((r) => <tr>…</tr>)`) as children; it shows `initial` of them
 * and appends a full-width "Show more" row that also auto-loads on scroll. Lets
 * a server-rendered report table render only its first page of rows up front.
 */
export function ProgressiveTableBody({
  children,
  colSpan,
  initial = 10,
  step = 10,
  threshold = 30,
  label = "Show more",
  className,
}: {
  children: React.ReactNode;
  colSpan: number;
  initial?: number;
  step?: number;
  threshold?: number;
  label?: string;
  className?: string;
}) {
  const rows = Children.toArray(children);
  const { count, hasMore, remaining, showMore, sentinelRef } = useProgressiveReveal(rows.length, {
    initial,
    step,
    threshold,
  });
  return (
    <tbody className={className}>
      {rows.slice(0, count)}
      {hasMore && (
        <tr>
          <td colSpan={colSpan} className="px-4 py-3 text-center">
            <div ref={sentinelRef} className="flex justify-center">
              <Button type="button" variant="outline" size="sm" onClick={showMore}>
                {label} ({remaining} more)
              </Button>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}
