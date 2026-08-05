/**
 * Who may be dropped into a given bed — the picker list behind the bed board
 * and the live-occupancy card.
 *
 * Extracted as a pure function because the rule is easy to get subtly wrong:
 * an earlier version excluded everyone already in the room, which quietly made
 * it impossible to move somebody between beds *within* their own cabin. A
 * person holds a single on-board trip, so pointing that trip at a room + bed is
 * inherently "one place at a time" — moving within a room and moving between
 * rooms are the same write.
 *
 * The list also carries people who are ASHORE. Allocating a berth to someone
 * who is not yet on board boards them in the same step, which is how the
 * accommodation desk actually works — otherwise a bed cannot be given to
 * anybody until somebody else has boarded them elsewhere. Because that write
 * moves POB, muster and catering counts, those rows are labelled as boarding
 * and are only offered to callers holding the offshore `operate` verb.
 */

export interface BedPoolPerson {
  /** The person's on-board trip id — what the assignment writes to. */
  id: string;
  room_id: string | null;
  name: string;
  /** Label of the room they are currently in, if any. */
  placedIn: string | null;
  /** Their current bed within that room, if any. */
  bed: string | null;
}

/** A roster member who is not on board — allocating a bed will board them. */
export interface AshorePerson {
  profile_id: string;
  name: string;
  /** Their crew, for context in the label. */
  crew_name?: string | null;
}

export interface BedCandidate {
  /** Trip id when kind is "move", profile id when kind is "board". */
  id: string;
  /** "move" rewrites an existing trip; "board" creates one. */
  kind: "move" | "board";
  /** True for people on board with no bed yet — they sort to the top. */
  waiting: boolean;
  label: string;
}

/**
 * Candidates for a bed in `roomId`, sorted with the bed-less first, then people
 * already on board, then ashore staff, each group alphabetical.
 *
 * Nobody on board is excluded: someone already in this room is offered as a bed
 * change, someone in another room as a move, someone with no bed as a plain
 * assignment. `ashore` is only included when `includeAshore` is set, since
 * boarding needs a permission the picker itself cannot check.
 */
export function bedCandidates(
  pool: readonly BedPoolPerson[],
  roomId: string,
  ashore: readonly AshorePerson[] = [],
  includeAshore = false,
): BedCandidate[] {
  const onboard: BedCandidate[] = pool.map((p) => {
    const here = p.room_id === roomId;
    return {
      id: p.id,
      kind: "move" as const,
      waiting: !p.room_id,
      label: here
        ? `${p.name} — change bed${p.bed ? ` (now ${p.bed})` : ""}`
        : p.placedIn
          ? `${p.name} — move from ${p.placedIn}`
          : p.name,
    };
  });

  const toBoard: BedCandidate[] = includeAshore
    ? ashore.map((a) => ({
        id: a.profile_id,
        kind: "board" as const,
        waiting: false,
        // Says plainly that picking this does more than seat them.
        label: `${a.name}${a.crew_name ? ` · ${a.crew_name}` : ""} — ashore, board into this bed`,
      }))
    : [];

  const byLabel = (a: BedCandidate, b: BedCandidate) =>
    Number(b.waiting) - Number(a.waiting) || a.label.localeCompare(b.label);

  // Ashore people sort last: seating someone already offshore is the common
  // case, and boarding is the heavier action.
  return [...onboard.sort(byLabel), ...toBoard.sort(byLabel)];
}
