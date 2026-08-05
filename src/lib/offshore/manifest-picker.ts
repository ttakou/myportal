/**
 * Who may go on a manifest, and what adding them will do to their status.
 *
 * A manifest is a movement plan, and the two directions are the two halves of a
 * crew change:
 *
 *   "out"  — joining the installation (mobilise). People on it are ashore now.
 *   "in"   — leaving it (demobilise).            People on it are aboard now.
 *
 * Note those value names are the historic ones and read backwards next to the
 * words "inbound/outbound", which different sites use in opposite senses. Never
 * label a control with those words alone — say the action (joining / leaving).
 *
 * Anyone may be put on either manifest: the operator is not restricted, because
 * real crew changes carry late additions and people already in place. What the
 * direction decides is whether adding somebody also CHANGES their status, which
 * the caller confirms before it happens.
 */

export type ManifestDirection = "out" | "in";

export interface PickerStaff {
  profile_id: string;
  name: string;
  crew_id: string | null;
  crew_name: string | null;
  travel_eligible: boolean;
}

export interface PickerOnboard {
  profile_id: string | null;
  crew_id: string | null;
}

export interface PickerVisit {
  id: string;
  visitor_name: string;
  status: string;
}

export interface ManifestCandidate {
  /** Stable list key: "s"+profile id, or "v"+visit id. */
  key: string;
  id: string;
  kind: "staff" | "visitor";
  name: string;
  crew_id: string | null;
  crew_name: string | null;
  /** On board right now. */
  aboard: boolean;
  /** True when creating this manifest will mobilise or demobilise them. */
  moves: boolean;
  label: string;
}

/** What creating the manifest would do to this person, if anything. */
function movementFor(direction: ManifestDirection, aboard: boolean): "board" | "offboard" | null {
  if (direction === "out") return aboard ? null : "board";
  return aboard ? "offboard" : null;
}

/**
 * Everyone selectable for a manifest in this direction — every travel-eligible
 * roster member whatever their current status, plus the visitors whose booking
 * is live. Each row says where the person is now and what adding them will do.
 */
export function manifestCandidates(input: {
  direction: ManifestDirection;
  roster: readonly PickerStaff[];
  onboard: readonly PickerOnboard[];
  visits: readonly PickerVisit[];
}): ManifestCandidate[] {
  const { direction, roster, onboard, visits } = input;
  const aboardIds = new Set(onboard.map((o) => o.profile_id).filter(Boolean) as string[]);

  const staff: ManifestCandidate[] = roster
    .filter((m) => m.travel_eligible)
    .map((m) => {
      const aboard = aboardIds.has(m.profile_id);
      const move = movementFor(direction, aboard);
      return {
        key: "s" + m.profile_id,
        id: m.profile_id,
        kind: "staff" as const,
        name: m.name,
        crew_id: m.crew_id,
        crew_name: m.crew_name,
        aboard,
        moves: move !== null,
        label:
          `${m.name}${m.crew_name ? ` · ${m.crew_name}` : ""} — ${aboard ? "on board" : "ashore"}` +
          (move === "board" ? " · will be mobilised" : move === "offboard" ? " · will be demobilised" : ""),
      };
    });

  // A visitor's movement is driven by their own booking workflow, so they never
  // carry a mobilise/demobilise side effect here.
  const visitor: ManifestCandidate[] = visits
    .filter((v) => v.status === "approved" || v.status === "onboard")
    .map((v) => ({
      key: "v" + v.id,
      id: v.id,
      kind: "visitor" as const,
      name: v.visitor_name,
      crew_id: null,
      crew_name: null,
      aboard: v.status === "onboard",
      moves: false,
      label: `${v.visitor_name} (visitor) — ${v.status === "onboard" ? "on board" : "approved"}`,
    }));

  return [...staff, ...visitor].sort(
    (a, b) => Number(b.moves) - Number(a.moves) || a.name.localeCompare(b.name),
  );
}

/**
 * The whole of one crew, for the "fill with entire crew" control.
 *
 * Takes the crew members who are on the correct side of the change for this
 * direction — ashore people for a joining run, aboard people for a leaving one
 * — since that is what a crew change actually moves. Individuals can still be
 * added by hand afterwards.
 */
export function crewFill(
  candidates: readonly ManifestCandidate[],
  crewId: string,
  direction: ManifestDirection,
): ManifestCandidate[] {
  return candidates.filter(
    (c) =>
      c.kind === "staff" &&
      c.crew_id === crewId &&
      (direction === "out" ? !c.aboard : c.aboard),
  );
}

/** A person the schedule says should travel, as produced by planManifest. */
export interface PlannedPick {
  id: string;
  name: string;
  kind: "staff" | "visitor";
  crew_id: string | null;
}

/**
 * Turn the schedule's picks into manifest rows, WITHOUT losing anybody.
 *
 * Matching picks to the candidate list and discarding the misses looks tidy and
 * is quietly wrong: candidates are built from the offshore-staff roster, while
 * the schedule's leaving side comes from live trips, and the two do not agree —
 * production currently has 50 people on board who hold no roster row. Dropping
 * them produced an empty manifest under a banner announcing the crew, which
 * reads as the schedule being broken.
 *
 * A pick with no candidate is therefore carried through on its own details. It
 * is still marked as moving where the direction implies it, so the confirmation
 * covers them too.
 */
export function planPicksAsCandidates(
  picks: readonly PlannedPick[],
  all: readonly ManifestCandidate[],
  direction: ManifestDirection,
  aboardProfileIds: ReadonlySet<string>,
): ManifestCandidate[] {
  const byKey = new Map(all.map((c) => [c.key, c]));
  return picks.map((p) => {
    const key = (p.kind === "staff" ? "s" : "v") + p.id;
    const known = byKey.get(key);
    if (known) return known;
    // Not on the roster (or not otherwise selectable) — keep them anyway.
    const aboard = p.kind === "staff" ? aboardProfileIds.has(p.id) : direction === "in";
    const move = p.kind === "staff" ? movementFor(direction, aboard) : null;
    return {
      key,
      id: p.id,
      kind: p.kind,
      name: p.name,
      crew_id: p.crew_id,
      crew_name: null,
      aboard,
      moves: move !== null,
      label:
        `${p.name}${p.kind === "visitor" ? " (visitor)" : ""} — ${aboard ? "on board" : "ashore"}` +
        (move === "board" ? " · will be mobilised" : move === "offboard" ? " · will be demobilised" : ""),
    };
  });
}

/** The status changes creating this manifest would apply, for the confirmation. */
export function pendingMovements(
  picked: readonly ManifestCandidate[],
  direction: ManifestDirection,
): { board: ManifestCandidate[]; offboard: ManifestCandidate[] } {
  const staff = picked.filter((p) => p.kind === "staff");
  return {
    board: direction === "out" ? staff.filter((p) => !p.aboard) : [],
    offboard: direction === "in" ? staff.filter((p) => p.aboard) : [],
  };
}
