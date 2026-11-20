/**
 * Which bed to show for somebody: the one they are in, or the one they get.
 *
 * A rotational worker has a default cabin on the roster and, while on board,
 * a bed on the trip — usually the same, sometimes not (a late arrival put
 * wherever there was room, a cabin out of service). The card must say which
 * it is showing: "in Room 308" is a fact about now; "default Room 308" is a
 * fact about the roster. Muster and catering read the first;
 * accommodation planning reads the second.
 */

export interface BedInput {
  /** True when a recorded trip has the person on board today. */
  onBoard: boolean;
  tripRoom: string | null;
  tripBed: string | null;
  fixedRoom: string | null;
  fixedBed: string | null;
}

export type BedSource = "trip" | "default" | "none";

export interface BedShown {
  source: BedSource;
  /** "Room 308", or null when nothing is assigned anywhere. */
  label: string | null;
  /** The roster's default, when it differs from the bed in use. */
  differsFromDefault: string | null;
}

/** "Bed 1" as stored, or "Bed " in front of a bare number or bunk letter. */
export function bedLabel(bed: string | null | undefined): string | null {
  const b = (bed ?? "").trim();
  if (!b) return null;
  return /^bed\b/i.test(b) ? b : `Bed ${b}`;
}

/**
 * What is shown is the room only. Bed numbers are kept as bookkeeping (they
 * keep two people off one berth) but are not displayed anywhere: what matters
 * is the room and how many beds it has.
 */
function label(room: string | null, _bed: string | null): string | null {
  void _bed;
  return room || null;
}

export function bedFor(input: BedInput): BedShown {
  const inUse = input.onBoard ? label(input.tripRoom, input.tripBed) : null;
  const fallback = label(input.fixedRoom, input.fixedBed);

  if (inUse) {
    return {
      source: "trip",
      label: inUse,
      differsFromDefault: fallback && fallback !== inUse ? fallback : null,
    };
  }
  if (fallback) return { source: "default", label: fallback, differsFromDefault: null };
  return { source: "none", label: null, differsFromDefault: null };
}
