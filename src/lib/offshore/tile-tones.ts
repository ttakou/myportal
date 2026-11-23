/**
 * Traffic-light colours for the offshore Overview tiles, as the site set them.
 * Pure: a number in, a colour out.
 */

export type TileTone = "green" | "amber" | "red";

/** POB: green below 120, amber 120–150, red above 150. */
export function pobTone(pob: number): TileTone {
  if (pob > 150) return "red";
  if (pob >= 120) return "amber";
  return "green";
}

/** Free beds outside the Echo room: red below 5, amber 5–12, green above 12. */
export function freeBedsTone(freeOutsideEcho: number): TileTone {
  if (freeOutsideEcho < 5) return "red";
  if (freeOutsideEcho <= 12) return "amber";
  return "green";
}

/** Empty rooms: red at none, amber at one, green from two. */
export function emptyRoomsTone(empty: number): TileTone {
  if (empty <= 0) return "red";
  if (empty === 1) return "amber";
  return "green";
}

/** On board with no room: red if anyone, green if nobody. */
export function noRoomTone(count: number): TileTone {
  return count > 0 ? "red" : "green";
}
