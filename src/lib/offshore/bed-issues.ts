/**
 * Bed-allocation conflicts within a room.
 *
 * The estate uses three legitimate bed conventions at once: positional labels
 * ("Bed 1"), the facility's own bunk numbers painted on the berths (13–16 in
 * Door 3, 40–43 in Door 5, …) and bottom/top ("B"/"T") in two-berth cabins.
 * None of those is wrong, so nothing here rewrites a label — the point is to
 * surface the cases that ARE wrong: two people on one bunk, more people than
 * berths, or somebody on board with no bed at all.
 *
 * Labels are compared case- and whitespace-insensitively, so "bed 1", "Bed 1"
 * and " BED 1 " count as the same berth. That comparison is the only
 * normalisation applied — the stored label is left exactly as entered, because
 * in a muster it is how someone is physically found.
 */

export type BedIssueKind = "duplicate" | "over_capacity" | "unassigned";

export interface BedIssue {
  kind: BedIssueKind;
  /** Human-readable, ready to render. */
  message: string;
  /** The bed labels involved, as stored (duplicates only). */
  beds: string[];
}

/** Comparison key for a bed label: trimmed, collapsed, case-folded. */
export function bedKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface BedIssueRoom {
  bed_count: number;
  occupants: { bed_no: string | null }[];
}

/**
 * Every conflict in one room, most severe first: a shared bunk, then a room
 * holding more people than it has berths, then anyone with no bed recorded.
 * An empty array means the room is clean.
 */
export function roomBedIssues(room: BedIssueRoom): BedIssue[] {
  const issues: BedIssue[] = [];

  // Two people on one berth. Grouped by normalised key so a casing or spacing
  // difference cannot hide a clash.
  const byKey = new Map<string, string[]>();
  for (const o of room.occupants) {
    if (!o.bed_no || !o.bed_no.trim()) continue;
    const k = bedKey(o.bed_no);
    byKey.set(k, [...(byKey.get(k) ?? []), o.bed_no]);
  }
  const shared = [...byKey.values()].filter((labels) => labels.length > 1);
  for (const labels of shared) {
    issues.push({
      kind: "duplicate",
      message: `${labels.length} people on bed ${labels[0]}`,
      beds: labels,
    });
  }

  // More bodies than berths — a hot-bunk or a bad allocation, either way it
  // needs a human.
  const beds = Math.max(0, room.bed_count);
  if (room.occupants.length > beds) {
    issues.push({
      kind: "over_capacity",
      message: `${room.occupants.length} people in ${beds} bed(s)`,
      beds: [],
    });
  }

  const unassigned = room.occupants.filter((o) => !o.bed_no || !o.bed_no.trim()).length;
  if (unassigned > 0) {
    issues.push({
      kind: "unassigned",
      message: `${unassigned} on board here with no bed recorded`,
      beds: [],
    });
  }

  return issues;
}

/** The normalised bed keys that are shared, for highlighting the rows. */
export function duplicateBedKeys(room: BedIssueRoom): Set<string> {
  const counts = new Map<string, number>();
  for (const o of room.occupants) {
    if (!o.bed_no || !o.bed_no.trim()) continue;
    const k = bedKey(o.bed_no);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
