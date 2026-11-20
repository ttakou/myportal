/**
 * Offshore visitors' dates and how their status follows them.
 *
 * A visit always has a return date: a day visit comes back the day it goes,
 * an overnight visit later. Once approved, the dates drive the status: on the
 * departure date the visitor is on board, on the return date returned (and
 * the bed freed). The desk corrects what did not happen — a no-show, a late
 * return. Casual visitors added on board by hand are left to the desk.
 *
 * Pure: dates in, decisions out.
 */

/** Check a request's dates; a day visit with no return comes back the same day. */
export function visitDates(
  depart: string,
  ret: string | null | undefined,
  overnight: boolean,
): { ok: true; departDate: string; returnDate: string } | { ok: false; error: string } {
  if (!depart) return { ok: false, error: "Departure date is required." };
  const back = (ret ?? "").trim() || (overnight ? "" : depart);
  if (!back) return { ok: false, error: "Return date is required for an overnight visit." };
  if (back < depart) return { ok: false, error: "The return date cannot be before the departure date." };
  if (overnight && back === depart) return { ok: false, error: "An overnight visit returns after the day it departs." };
  return { ok: true, departDate: depart, returnDate: back };
}

export interface VisitLite {
  id: string;
  status: string;
  depart_date: string;
  return_date: string | null;
  is_casual?: boolean | null;
}

/**
 * Who boards and who returns today. Back on or after the return date means
 * returned, whether or not anyone marked them aboard; otherwise an approved
 * visitor whose departure has come is on board, unless the desk marked them
 * a no-show on the manifest.
 */
export function visitorMoves(
  visits: VisitLite[],
  today: string,
  noShows: Set<string> = new Set(),
): { board: string[]; ret: string[] } {
  const board: string[] = [];
  const ret: string[] = [];
  for (const v of visits) {
    if (v.is_casual) continue;
    if (v.status !== "approved" && v.status !== "onboard") continue;
    if (v.return_date && v.return_date <= today) {
      if (v.status === "approved" && noShows.has(v.id)) continue;
      ret.push(v.id);
      continue;
    }
    if (v.status === "approved" && v.depart_date <= today && !noShows.has(v.id)) board.push(v.id);
  }
  return { board, ret };
}
