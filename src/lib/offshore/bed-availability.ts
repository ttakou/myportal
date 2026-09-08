/**
 * How many beds a room has free for a stay, and which berth to give next.
 *
 * The old count subtracted every cabin owner from the bed count, so Door 3
 * (12 beds, 21 owners on alternating crews) was never offered to anybody.
 * Owners do not occupy a bed by owning it; a person occupies a bed by having
 * a trip or a visitor allocation that overlaps the stay. Pure.
 */

export interface Stay {
  from: string;
  /** Null for an open-ended stay (a trip with no demob date yet). */
  to: string | null;
}

/** True when two date ranges share at least one day. Open ends never end. */
export function staysOverlap(a: Stay, b: Stay): boolean {
  const aEnds = a.to ?? "9999-12-31";
  const bEnds = b.to ?? "9999-12-31";
  return a.from <= bEnds && b.from <= aEnds;
}

/** Beds left in a room for a stay: capacity less everybody whose stay overlaps it. */
export function freeBedsFor(bedCount: number, occupants: Stay[], stay: Stay): number {
  const taken = occupants.filter((o) => staysOverlap(o, stay)).length;
  return Math.max(0, Math.max(0, bedCount) - taken);
}

const BED_RE = /^\s*bed\s*(\d+)\s*$/i;

/** The berth number a stored label names, or null for anything else. */
export function bedNumber(label: string | null | undefined): number | null {
  const m = label ? BED_RE.exec(label) : null;
  return m ? Number(m[1]) : null;
}

/**
 * The lowest "Bed k" not in use, 1..bedCount; null when the room is full.
 * Labels that are not "Bed k" (a painted bunk number, "B"/"T") hold no berth
 * here, which is why every room was renumbered first.
 */
export function lowestFreeBed(bedCount: number, used: (string | null | undefined)[]): string | null {
  const taken = new Set(used.map(bedNumber).filter((n): n is number => n != null));
  for (let k = 1; k <= bedCount; k++) if (!taken.has(k)) return `Bed ${k}`;
  return null;
}
