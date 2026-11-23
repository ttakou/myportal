/**
 * Putting people on board only happens on the day they travel, and a
 * mobilisation entered by mistake can be taken back that same day.
 *
 * Pure: dates in, decisions out. Dates are site dates (Douala), "YYYY-MM-DD".
 */

/** The site's calendar date for a timestamp. */
export function siteDateOf(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
}

/**
 * Whether a manifest may move people (board or demob them) now. A manifest
 * dated later only lists who will travel: they move when it is confirmed on
 * the day, or by the nightly crew change — never early.
 */
export function movesPeopleNow(scheduledDate: string, todayIso: string): boolean {
  return !!scheduledDate && scheduledDate <= todayIso;
}

/**
 * A mobilisation can be undone (the trip removed, as if never entered) while
 * the person is still on board and it was made today: mobilised for today or
 * later, or entered today. Anyone aboard longer is taken off with Demob,
 * which keeps their stay in the history.
 */
export function canUndoMobilisation(
  trip: { status: string; mobilize_date: string; created_at: string },
  todayIso: string,
): boolean {
  if (trip.status !== "onboard") return false;
  return trip.mobilize_date >= todayIso || siteDateOf(trip.created_at) === todayIso;
}
