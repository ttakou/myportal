/**
 * Label matching for the type-to-filter pickers (`SearchSelect`).
 *
 * Kept separate from the component so the matching rules — which decide whether
 * a dispatcher finds the right person under time pressure — are unit-testable.
 */

/** Matches anywhere in the label, case- and accent-insensitive. */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // Strip combining marks so "Ngaleu" finds "Ngaléu" and vice versa.
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export interface FilteredOptions<T> {
  /** The rows to render — capped at `maxVisible`. */
  matches: T[];
  /** How many matched in total, so the UI can say how many are hidden. */
  total: number;
}

/**
 * Filter `options` by `query`, matching each term anywhere in the label.
 *
 * Multiple words all have to match, in any order, so "kom door" finds
 * "KOM KOM — move from Door 3". An empty query returns everything.
 */
export function filterOptions<T>(
  options: readonly T[],
  query: string,
  getLabel: (option: T) => string,
  maxVisible: number,
): FilteredOptions<T> {
  const terms = normalizeLabel(query).split(/\s+/).filter(Boolean);
  const hit = terms.length
    ? options.filter((o) => {
        const hay = normalizeLabel(getLabel(o));
        return terms.every((t) => hay.includes(t));
      })
    : options;
  return { matches: hit.slice(0, maxVisible), total: hit.length };
}
