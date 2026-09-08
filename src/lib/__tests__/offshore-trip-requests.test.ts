import { describe, expect, it } from "vitest";
import {
  canApproveRequests,
  canAssignRooms,
  groupByParty,
  requestCounts,
  requestQueues,
} from "@/lib/offshore/trip-requests";
import type { OffshoreTrip, VisitRequest } from "@/types/offshore";

const visit = (over: Partial<VisitRequest> & { id: string }): VisitRequest => ({
  group_id: null,
  requester_name: null,
  visitor_name: over.id,
  visitor_company: null,
  visitor_type: "contractor",
  gender: "any",
  host_department: null,
  host_name: null,
  purpose: null,
  installation_id: "inst",
  installation_name: "Juliet",
  depart_date: "2026-09-10",
  return_date: "2026-09-12",
  overnight: true,
  accommodation_required: true,
  emergency_contact: null,
  status: "requested",
  reject_reason: null,
  allocation: null,
  ...over,
});

const trip = (over: Partial<OffshoreTrip> & { id: string }): OffshoreTrip => ({
  person_name: over.id,
  installation_id: "inst",
  installation_name: "Juliet",
  mobilize_date: "2026-09-10",
  demob_date: null,
  status: "requested",
  hse_cleared_at: null,
  flight_id: null,
  flight_label: null,
  bed_no: null,
  room_id: null,
  room_label: null,
  mode: "auto",
  ...over,
});

describe("requestQueues", () => {
  it("sorts visits into approve, bed, ready and history", () => {
    const q = requestQueues(
      [
        visit({ id: "a" }),
        visit({ id: "b", status: "approved" }),
        visit({ id: "c", status: "approved", allocation: { id: "x", room_id: "r", room_label: "Room 204", from_date: "2026-09-10", to_date: "2026-09-12", status: "reserved" } }),
        // A day trip needs no bed.
        visit({ id: "d", status: "approved", accommodation_required: false }),
        visit({ id: "e", status: "onboard" }),
        visit({ id: "f", status: "rejected" }),
      ],
      [],
    );
    expect(q.visitsToApprove.map((v) => v.id)).toEqual(["a"]);
    expect(q.visitsToBed.map((v) => v.id)).toEqual(["b"]);
    expect(q.visitsReady.map((v) => v.id)).toEqual(["c", "d"]);
    expect(q.visitsHistory.map((v) => v.id)).toEqual(["e", "f"]);
  });

  it("sorts staff trips the same way, on HSE clearance and a room", () => {
    const q = requestQueues(
      [],
      [
        trip({ id: "a" }),
        trip({ id: "b", status: "hse_cleared" }),
        trip({ id: "c", status: "manifested", room_id: "r", room_label: "Door 3" }),
        trip({ id: "d", status: "onboard", room_id: "r" }),
        trip({ id: "e", status: "cancelled" }),
      ],
    );
    expect(q.tripsToApprove.map((t) => t.id)).toEqual(["a"]);
    expect(q.tripsToBed.map((t) => t.id)).toEqual(["b"]);
    expect(q.tripsReady.map((t) => t.id)).toEqual(["c"]);
    expect(q.tripsHistory.map((t) => t.id)).toEqual(["d", "e"]);
  });

  it("counts across both kinds", () => {
    const q = requestQueues([visit({ id: "a" }), visit({ id: "b", status: "approved" })], [trip({ id: "t" })]);
    expect(requestCounts(q)).toEqual({ toApprove: 2, toBed: 1, ready: 0 });
  });
});

describe("who may act", () => {
  it("lets the OIM approve and the Campboss bed, and an admin do both", () => {
    const oim = { manager: true, oim: true, campboss: false, dispatcher: false, registrar: false };
    const campboss = { manager: true, oim: false, campboss: true, dispatcher: false, registrar: false };
    const admin = { manager: true, oim: true, campboss: true, dispatcher: false, registrar: false };
    const supervisor = { manager: false, dispatcher: false, registrar: true };
    expect(canApproveRequests(oim)).toBe(true);
    expect(canAssignRooms(oim)).toBe(false);
    expect(canApproveRequests(campboss)).toBe(false);
    expect(canAssignRooms(campboss)).toBe(true);
    expect(canApproveRequests(admin) && canAssignRooms(admin)).toBe(true);
    expect(canApproveRequests(supervisor) || canAssignRooms(supervisor)).toBe(false);
  });
});

describe("groupByParty", () => {
  it("keeps a party together and singles alone, in first-seen order", () => {
    const g = groupByParty([
      visit({ id: "a", group_id: "g1" }),
      visit({ id: "b" }),
      visit({ id: "c", group_id: "g1" }),
    ]);
    expect(g.map((p) => p.map((v) => v.id))).toEqual([["a", "c"], ["b"]]);
  });
});
