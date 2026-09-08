import { describe, expect, it } from "vitest";
import { isPastTripRequest, isPastVisitRequest, pastRequests } from "@/lib/offshore/past-requests";
import type { OffshoreTrip, VisitRequest } from "@/types/offshore";

const today = "2026-09-08";

describe("isPastTripRequest", () => {
  it("is past when still open and the stay ended before today", () => {
    expect(isPastTripRequest({ status: "hse_cleared", mobilize_date: "2026-08-04", demob_date: "2026-08-11" }, today)).toBe(true);
    // No demob date: the mobilise day is the whole stay.
    expect(isPastTripRequest({ status: "requested", mobilize_date: "2026-09-07", demob_date: null }, today)).toBe(true);
  });

  it("keeps a stay that reaches today, and anything that already moved", () => {
    expect(isPastTripRequest({ status: "manifested", mobilize_date: "2026-09-01", demob_date: "2026-09-08" }, today)).toBe(false);
    expect(isPastTripRequest({ status: "requested", mobilize_date: "2026-09-10", demob_date: null }, today)).toBe(false);
    expect(isPastTripRequest({ status: "onboard", mobilize_date: "2026-08-01", demob_date: "2026-08-20" }, today)).toBe(false);
    expect(isPastTripRequest({ status: "cancelled", mobilize_date: "2026-08-01", demob_date: null }, today)).toBe(false);
  });
});

describe("isPastVisitRequest", () => {
  it("applies to requested and approved visits whose dates passed", () => {
    expect(isPastVisitRequest({ status: "approved", depart_date: "2026-08-20", return_date: "2026-08-22" }, today)).toBe(true);
    expect(isPastVisitRequest({ status: "requested", depart_date: "2026-09-08", return_date: null }, today)).toBe(false);
    expect(isPastVisitRequest({ status: "onboard", depart_date: "2026-08-20", return_date: "2026-08-22" }, today)).toBe(false);
  });
});

describe("pastRequests", () => {
  it("returns the two lists", () => {
    const trips = [{ id: "t", status: "hse_cleared", mobilize_date: "2026-06-18", demob_date: "2026-06-23" }] as OffshoreTrip[];
    const visits = [{ id: "v", status: "approved", depart_date: "2026-09-20", return_date: null }] as VisitRequest[];
    const r = pastRequests(visits, trips, today);
    expect(r.trips.map((t) => t.id)).toEqual(["t"]);
    expect(r.visits).toEqual([]);
  });
});
