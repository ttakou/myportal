/**
 * Single source of truth for resolving a person's muster / lifeboat station.
 * The lifeboat is a property of the cabin (the room drives it); an operator may
 * override one person's station manually. Keeping this in one place stops the
 * live board, POB and the muster roll-call from drifting apart — a safety bug if
 * they disagree during a real muster.
 */

/** Staff on a rotation: manual override > cabin > legacy stored value. */
export function tripLifeboat(input: {
  lifeboat_override?: string | null;
  room_lifeboat?: string | null;
  lifeboat?: string | null;
}): string | null {
  return input.lifeboat_override || input.room_lifeboat || input.lifeboat || null;
}

/** Visitors: a direct/manual value > the allocated cabin's station. */
export function visitorLifeboat(input: {
  lifeboat?: string | null;
  room_lifeboat?: string | null;
}): string | null {
  return input.lifeboat || input.room_lifeboat || null;
}
