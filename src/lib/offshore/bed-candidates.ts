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

export interface BedCandidate {
  id: string;
  /** True for people on board with no bed yet — they sort to the top. */
  waiting: boolean;
  label: string;
}

/**
 * Candidates for a bed in `roomId`, sorted with the bed-less first and then
 * alphabetically. Nobody is excluded: someone already in this room is offered
 * as a bed change, someone in another room as a move, and someone with no bed
 * as a plain assignment.
 */
export function bedCandidates(pool: readonly BedPoolPerson[], roomId: string): BedCandidate[] {
  return pool
    .map((p) => {
      const here = p.room_id === roomId;
      return {
        id: p.id,
        waiting: !p.room_id,
        label: here
          ? `${p.name} — change bed${p.bed ? ` (now ${p.bed})` : ""}`
          : p.placedIn
            ? `${p.name} — move from ${p.placedIn}`
            : p.name,
      };
    })
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || a.label.localeCompare(b.label));
}
