/**
 * Which requests are over without ever happening.
 *
 * A trip request whose dates have passed with nobody boarded, or a visit
 * request whose dates passed undecided or unbedded, sits in the queue for
 * ever: nine of them were still "awaiting a room" two months after the
 * stay. Archiving cancels them, which is what the record shows they were.
 * Pure: dates in, a verdict out.
 */

import type { OffshoreTrip, VisitRequest } from "@/types/offshore";

/** Trip states before anybody moved. */
const TRIP_OPEN = new Set(["requested", "hse_cleared", "manifested"]);
/** Visit states before anybody arrived. */
const VISIT_OPEN = new Set(["requested", "approved"]);

/** True when the request is still open and its whole stay is before today. */
export function isPastTripRequest(
  t: Pick<OffshoreTrip, "status" | "mobilize_date" | "demob_date"> & { is_request?: boolean },
  todayIso: string,
): boolean {
  if (t.is_request === false) return false;
  return TRIP_OPEN.has(t.status) && (t.demob_date ?? t.mobilize_date) < todayIso;
}

export function isPastVisitRequest(v: Pick<VisitRequest, "status" | "depart_date" | "return_date">, todayIso: string): boolean {
  return VISIT_OPEN.has(v.status) && (v.return_date ?? v.depart_date) < todayIso;
}

export function pastRequests(visits: VisitRequest[], trips: OffshoreTrip[], todayIso: string) {
  return {
    visits: visits.filter((v) => isPastVisitRequest(v, todayIso)),
    trips: trips.filter((t) => isPastTripRequest(t, todayIso)),
  };
}

/** The note left on an archived visit request. */
export const ARCHIVE_REASON = "Archived: the dates passed with nobody travelling.";
