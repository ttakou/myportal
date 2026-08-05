/**
 * Room labelling and ordering, shared by the accommodation screens and the
 * room-allocation report so they always list rooms the same way.
 *
 * Ordering is alphabetical but NUMERIC-AWARE: a plain string sort puts
 * "Door 10" before "Door 3", which is wrong for anyone scanning a corridor.
 * Comparison also ignores case and accents, so "door 5" and "Door 5" cannot
 * end up in different places in the list.
 */

export interface RoomLike {
  block: string | null;
  room_number: string;
}

/** The room's display label — "Block Number", or just the number. */
export function roomLabel(r: RoomLike): string {
  return [r.block, r.room_number].filter(Boolean).join(" ").trim();
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Compare two room labels for a natural A→Z listing. */
export function compareRoomLabels(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Compare two rooms for a natural A→Z listing. */
export function compareRooms(a: RoomLike, b: RoomLike): number {
  return compareRoomLabels(roomLabel(a), roomLabel(b));
}

/** A new array of rooms in natural A→Z order. */
export function sortRooms<T extends RoomLike>(rooms: readonly T[]): T[] {
  return [...rooms].sort(compareRooms);
}
