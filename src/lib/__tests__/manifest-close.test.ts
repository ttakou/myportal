import { describe, expect, it } from "vitest";
import { confirmedTravellers, type ClosePax } from "@/lib/offshore/manifest-close";

const pax = (id: string, extra: Partial<ClosePax> = {}): ClosePax => ({ id, profile_id: null, visit_request_id: null, boarded: false, no_show: false, ...extra });

describe("closing a past manifest", () => {
  const trips = [
    { profile_id: "went", status: "onboard", mobilize_date: "2026-11-17", demob_date: "2026-12-08" },
    { profile_id: "late", status: "onboard", mobilize_date: "2026-11-19", demob_date: "2026-12-08" },
    { profile_id: "back", status: "demobilised", mobilize_date: "2026-10-27", demob_date: "2026-11-17" },
    { profile_id: "stayed", status: "onboard", mobilize_date: "2026-10-27", demob_date: null },
  ];

  it("ticks the MOB passengers whose trip started around that day", () => {
    const ids = confirmedTravellers({
      date: "2026-11-17",
      direction: "out",
      pax: [pax("1", { profile_id: "went" }), pax("2", { profile_id: "late" }), pax("3", { profile_id: "nobody" }), pax("4", { profile_id: "stayed" })],
      trips,
      visits: [],
    });
    expect(ids).toEqual(["1", "2"]);
  });

  it("ticks the DEMOB passengers whose trip ended around that day", () => {
    const ids = confirmedTravellers({
      date: "2026-11-17",
      direction: "in",
      pax: [pax("1", { profile_id: "back" }), pax("2", { profile_id: "stayed" })],
      trips,
      visits: [],
    });
    expect(ids).toEqual(["1"]);
  });

  it("follows visitors by their visit, and leaves no-shows and the already ticked alone", () => {
    const visits = [
      { id: "v1", status: "returned", depart_date: "2026-11-17", return_date: "2026-11-18" },
      { id: "v2", status: "cancelled", depart_date: "2026-11-17", return_date: "2026-11-18" },
    ];
    expect(
      confirmedTravellers({
        date: "2026-11-17",
        direction: "out",
        pax: [pax("a", { visit_request_id: "v1" }), pax("b", { visit_request_id: "v2" }), pax("c", { profile_id: "went", no_show: true }), pax("d", { profile_id: "went", boarded: true })],
        trips,
        visits,
      }),
    ).toEqual(["a"]);
  });
});
