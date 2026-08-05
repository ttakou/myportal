import { describe, expect, it } from "vitest";
import {
  countAwaitingBed,
  visitorsArrivingOn,
  visitorsAwaitingBed,
  type QueueVisit,
} from "@/lib/offshore/visitor-queue";

const v = (over: Partial<QueueVisit> & { id: string }): QueueVisit => ({
  visitor_name: "Visitor " + over.id,
  visitor_company: null,
  status: "approved",
  depart_date: "2026-06-16",
  return_date: "2026-06-18",
  accommodation_required: true,
  installation_id: "juliet",
  installation_name: "Juliet",
  allocation: null,
  ...over,
});

describe("visitorsAwaitingBed", () => {
  it("lists an approved visitor who needs a bed and has none", () => {
    const groups = visitorsAwaitingBed([v({ id: "1" })]);
    expect(countAwaitingBed(groups)).toBe(1);
    expect(groups[0].installation_name).toBe("Juliet");
  });

  it("drops a visitor once a bed is allocated", () => {
    expect(visitorsAwaitingBed([v({ id: "1", allocation: { room: "Door 5" } })])).toEqual([]);
  });

  it("ignores a day trip that needs no accommodation", () => {
    expect(visitorsAwaitingBed([v({ id: "1", accommodation_required: false })])).toEqual([]);
  });

  it("ignores a request that has not been approved yet", () => {
    expect(visitorsAwaitingBed([v({ id: "1", status: "requested" })])).toEqual([]);
  });

  it("ignores rejected, cancelled and returned visits", () => {
    for (const status of ["rejected", "cancelled", "returned"]) {
      expect(visitorsAwaitingBed([v({ id: "1", status })])).toEqual([]);
    }
  });

  it("keeps someone already on board without a bed — that is worse, not resolved", () => {
    expect(countAwaitingBed(visitorsAwaitingBed([v({ id: "1", status: "onboard" })]))).toBe(1);
  });

  it("groups by installation, alphabetically", () => {
    const groups = visitorsAwaitingBed([
      v({ id: "1", installation_id: "rig", installation_name: "RIG" }),
      v({ id: "2" }),
    ]);
    expect(groups.map((g) => g.installation_name)).toEqual(["Juliet", "RIG"]);
  });

  it("labels visits with no installation rather than hiding them", () => {
    const groups = visitorsAwaitingBed([
      v({ id: "1", installation_id: null, installation_name: null }),
    ]);
    expect(groups[0].installation_name).toBe("No installation set");
  });

  it("orders each group by departure date then name", () => {
    const groups = visitorsAwaitingBed([
      v({ id: "b", visitor_name: "Zoe", depart_date: "2026-06-20" }),
      v({ id: "c", visitor_name: "Bob", depart_date: "2026-06-16" }),
      v({ id: "a", visitor_name: "Amy", depart_date: "2026-06-16" }),
    ]);
    expect(groups[0].visits.map((x) => x.visitor_name)).toEqual(["Amy", "Bob", "Zoe"]);
  });

  it("counts across every installation", () => {
    const groups = visitorsAwaitingBed([
      v({ id: "1" }),
      v({ id: "2", installation_id: "rig", installation_name: "RIG" }),
      v({ id: "3" }),
    ]);
    expect(countAwaitingBed(groups)).toBe(3);
  });

  it("is empty for an empty input", () => {
    expect(visitorsAwaitingBed([])).toEqual([]);
    expect(countAwaitingBed([])).toBe(0);
  });
});

describe("visitorsArrivingOn", () => {
  it("lists approved visitors departing that day", () => {
    const groups = visitorsArrivingOn([v({ id: "1" }), v({ id: "2", depart_date: "2026-06-20" })], "2026-06-16");
    expect(countAwaitingBed(groups)).toBe(1);
    expect(groups[0].visits[0].id).toBe("1");
  });

  it("includes a day trip needing no bed — they still arrive", () => {
    const groups = visitorsArrivingOn([v({ id: "1", accommodation_required: false })], "2026-06-16");
    expect(countAwaitingBed(groups)).toBe(1);
  });

  it("excludes anyone not approved", () => {
    expect(visitorsArrivingOn([v({ id: "1", status: "requested" })], "2026-06-16")).toEqual([]);
  });
});
