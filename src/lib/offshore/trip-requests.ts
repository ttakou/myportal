/**
 * The Trip Requests desk: what is waiting on whom.
 *
 * Two kinds of request reach the platform — a visit request for somebody
 * from outside, and a trip request for a member of staff — and two people
 * deal with them: the OIM decides whether a trip happens, the Campboss finds
 * the bed. This module sorts the requests into those two queues and says
 * which role may act on each; the panel draws it. Pure.
 */

import type { OffshoreTrip, VisitRequest } from "@/types/offshore";
import type { OffshoreRoleFlags } from "@/app/(portal)/offshore/_components/offshore-views";

/** The OIM decides; admins carry the OIM's hat. */
export function canApproveRequests(flags: OffshoreRoleFlags): boolean {
  return Boolean(flags.oim);
}

/** The Campboss beds people; admins carry the Campboss's hat. */
export function canAssignRooms(flags: OffshoreRoleFlags): boolean {
  return Boolean(flags.campboss);
}

/** Trip states before the person has gone: a request in flight. */
export const TRIP_REQUEST_STATES = ["requested", "hse_cleared", "manifested"] as const;

export interface RequestQueues {
  /** Visit requests the OIM has not decided. */
  visitsToApprove: VisitRequest[];
  /** Approved visits that need a bed and have none. */
  visitsToBed: VisitRequest[];
  /** Approved visits with a bed, or day trips: nothing left to do here. */
  visitsReady: VisitRequest[];
  /** Staff trips awaiting HSE clearance (the OIM's approval). */
  tripsToApprove: OffshoreTrip[];
  /** Cleared or manifested staff trips with no room. */
  tripsToBed: OffshoreTrip[];
  /** Cleared or manifested staff trips with a room. */
  tripsReady: OffshoreTrip[];
  /** Everything decided and done: on board, returned, rejected, cancelled. */
  visitsHistory: VisitRequest[];
  tripsHistory: OffshoreTrip[];
}

export function requestQueues(visits: VisitRequest[], trips: OffshoreTrip[]): RequestQueues {
  const q: RequestQueues = {
    visitsToApprove: [],
    visitsToBed: [],
    visitsReady: [],
    tripsToApprove: [],
    tripsToBed: [],
    tripsReady: [],
    visitsHistory: [],
    tripsHistory: [],
  };
  for (const v of visits) {
    if (v.status === "requested") q.visitsToApprove.push(v);
    else if (v.status === "approved") {
      if (v.accommodation_required && !v.allocation) q.visitsToBed.push(v);
      else q.visitsReady.push(v);
    } else q.visitsHistory.push(v);
  }
  for (const t of trips) {
    if (t.status === "requested") q.tripsToApprove.push(t);
    else if (t.status === "hse_cleared" || t.status === "manifested") {
      if (t.room_id) q.tripsReady.push(t);
      else q.tripsToBed.push(t);
    } else q.tripsHistory.push(t);
  }
  return q;
}

export interface RequestCounts {
  toApprove: number;
  toBed: number;
  ready: number;
}

export function requestCounts(q: RequestQueues): RequestCounts {
  return {
    toApprove: q.visitsToApprove.length + q.tripsToApprove.length,
    toBed: q.visitsToBed.length + q.tripsToBed.length,
    ready: q.visitsReady.length + q.tripsReady.length,
  };
}

/** Group visit requests by their shared group_id; single requests stand alone. */
export function groupByParty(list: VisitRequest[]): VisitRequest[][] {
  const map = new Map<string, VisitRequest[]>();
  const order: string[] = [];
  for (const v of list) {
    const k = v.group_id ?? v.id;
    if (!map.has(k)) {
      map.set(k, []);
      order.push(k);
    }
    map.get(k)!.push(v);
  }
  return order.map((k) => map.get(k)!);
}
