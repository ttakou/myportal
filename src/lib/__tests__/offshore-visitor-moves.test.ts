import { describe, expect, it } from "vitest";
import { visitDates, visitorMoves } from "@/lib/offshore/visitor-moves";
import { manifestDays, visitorManifestTitle, visitorsDue, type DayCrew, type DayStaff, type DayVisit } from "@/lib/offshore/day-manifests";

describe("visit dates", () => {
  it("brings a day visit back the same day, and needs a later return for an overnight one", () => {
    expect(visitDates("2026-12-02", "", false)).toEqual({ ok: true, departDate: "2026-12-02", returnDate: "2026-12-02" });
    expect(visitDates("2026-12-02", null, true)).toEqual({ ok: false, error: "Return date is required for an overnight visit." });
    expect(visitDates("2026-12-02", "2026-12-02", true).ok).toBe(false);
    expect(visitDates("2026-12-02", "2026-12-01", false).ok).toBe(false);
    expect(visitDates("2026-12-02", "2026-12-05", true)).toEqual({ ok: true, departDate: "2026-12-02", returnDate: "2026-12-05" });
  });
});

describe("visitor status follows the dates", () => {
  const v = (id: string, status: string, depart: string, ret: string | null, extra: object = {}) => ({ id, status, depart_date: depart, return_date: ret, ...extra });

  it("boards on the departure date and returns on the return date", () => {
    const res = visitorMoves(
      [
        v("leaving-today", "approved", "2026-12-02", "2026-12-05"),
        v("not-yet", "approved", "2026-12-03", "2026-12-05"),
        v("back-today", "onboard", "2026-11-28", "2026-12-02"),
        v("still-out", "onboard", "2026-11-28", "2026-12-04"),
        v("day-trip", "approved", "2026-12-02", "2026-12-02"),
      ],
      "2026-12-02",
    );
    expect(res.board).toEqual(["leaving-today"]);
    expect(res.ret).toEqual(["back-today", "day-trip"]);
  });

  it("leaves no-shows, casual visitors and closed visits alone", () => {
    const res = visitorMoves(
      [
        v("no-show", "approved", "2026-12-02", "2026-12-05"),
        v("casual", "onboard", "2026-12-01", null, { is_casual: true }),
        v("rejected", "rejected", "2026-12-01", "2026-12-02"),
        v("no-show-past", "approved", "2026-11-20", "2026-11-25"),
      ],
      "2026-12-02",
      new Set(["no-show", "no-show-past"]),
    );
    expect(res).toEqual({ board: [], ret: [] });
  });
});

describe("visitors on the manifests", () => {
  const crew: DayCrew = { id: "A", name: "CREW A", offshore_days: 14, onshore_days: 14, cycle_start_date: "2026-12-01", installation_id: "juliet", transport_mode: "boat" };
  const staff: DayStaff[] = [{ profile_id: "p1", name: "Crew one", position: null, crew_id: "A", is_rotational: true }];
  const visits: DayVisit[] = [
    { id: "v1", visitor_name: "Auditor", status: "approved", installation_id: "juliet", depart_date: "2026-12-03", return_date: "2026-12-05" },
    { id: "v2", visitor_name: "No site", status: "approved", installation_id: null, depart_date: "2026-12-15", return_date: "2026-12-16" },
    { id: "v3", visitor_name: "Pending", status: "requested", installation_id: "juliet", depart_date: "2026-12-04", return_date: "2026-12-06" },
  ];

  it("adds a visitor-only day, with only the directions travelled", () => {
    const days = manifestDays({ crews: [crew], staff, visits, fromIso: "2026-12-01", days: 20, defaultInstallationId: "juliet" });
    const brief = days.map((d) => `${d.date}:${d.directions.join("+")}:${d.crewDay ? "crew" : "visitor"}`);
    expect(brief).toEqual([
      "2026-12-01:out+in:crew",
      "2026-12-03:out:visitor",
      "2026-12-05:in:visitor",
      "2026-12-15:out+in:crew",
      "2026-12-16:in:visitor",
    ]);
    // The crew change day on the 15th carries the visitor with no installation (default Juliet).
    expect(visitorsDue(visits, "2026-12-15", "out", "juliet", "juliet").map((p) => p.visit_request_id)).toEqual(["v2"]);
  });

  it("keeps a visitor off another installation's manifest", () => {
    expect(visitorsDue(visits, "2026-12-03", "out", "rig", "juliet")).toEqual([]);
    expect(visitorsDue(visits, "2026-12-05", "in", "juliet", "juliet").map((p) => p.reason)).toEqual(["Visitor — booked return"]);
  });

  it("titles a visitor-only manifest as a visitor movement", () => {
    expect(visitorManifestTitle("2026-12-03", "out", "Juliet")).toBe("Visitor movement 2026-12-03 · MOB · Shore → Juliet");
    expect(visitorManifestTitle("2026-12-05", "in", "Juliet")).toBe("Visitor movement 2026-12-05 · DEMOB · Juliet → Shore");
  });
});
