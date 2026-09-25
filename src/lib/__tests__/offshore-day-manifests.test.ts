import { describe, expect, it } from "vitest";
import {
  crewChangeDays,
  dayManifestTitle,
  daySeats,
  dueForDay,
  sharedTransport,
  type DayCrew,
  type DayOnboard,
  type DayStaff,
  type DayVisit,
} from "@/lib/offshore/day-manifests";

// Back-to-back 21/21 crews: A goes out on 6 Oct as B comes in; 28/28 J comes in the same day.
const crew = (id: string, start: string, days = 21, over: Partial<DayCrew> = {}): DayCrew => ({
  id,
  name: `Crew ${id}`,
  offshore_days: days,
  onshore_days: days,
  cycle_start_date: start,
  installation_id: "juliet",
  transport_mode: null,
  ...over,
});
const A = crew("A", "2026-06-02");
const B = crew("B", "2026-06-23");
const J = crew("J", "2026-05-19", 28);
const EMPTY = crew("L", "2026-07-07", 28);
const CREWS = [A, B, J, EMPTY];

const staff = (id: string, crew_id: string | null, is_rotational: boolean | null = true): DayStaff => ({
  profile_id: id,
  name: `Person ${id}`,
  position: "Operator",
  crew_id,
  is_rotational,
});
const STAFF = [staff("a1", "A"), staff("a2", "A"), staff("a3", "A", false), staff("b1", "B"), staff("b2", "B"), staff("j1", "J"), staff("x1", null)];

describe("crew change days", () => {
  it("finds each day a staffed crew changes, with who goes out and who comes in", () => {
    const days = crewChangeDays({ crews: CREWS, staff: STAFF, fromIso: "2026-09-25", days: 42 });
    expect(days.map((d) => `${d.date} out:${d.out.map((c) => c.id).join("")} in:${d.in.map((c) => c.id).join("")}`)).toEqual([
      "2026-10-06 out:A in:BJ",
      "2026-10-27 out:B in:A",
      "2026-11-03 out:J in:",
    ]);
    // Crew L has nobody on it, so its dates (e.g. 29 Sep) make no day.
    expect(days.some((d) => d.date === "2026-09-29")).toBe(false);
  });

  it("splits a day by installation, using the tenant default for a crew with none", () => {
    const days = crewChangeDays({
      crews: [A, { ...B, installation_id: null }],
      staff: STAFF,
      fromIso: "2026-10-06",
      days: 1,
      defaultInstallationId: "kilo",
    });
    expect(days.map((d) => [d.installationId, d.out.map((c) => c.id), d.in.map((c) => c.id)])).toEqual([
      ["juliet", ["A"], []],
      ["kilo", [], ["B"]],
    ]);
  });
});

describe("who is due", () => {
  const onboard: DayOnboard[] = [
    { profile_id: "b1", name: "Person b1", crew_id: "B", installation_id: "juliet", demob_date: "2026-10-06" },
    { profile_id: "x1", name: "Person x1", crew_id: null, installation_id: "juliet", demob_date: "2026-10-06" },
    { profile_id: "a1", name: "Person a1", crew_id: "A", installation_id: "juliet", demob_date: "2026-10-06" }, // came out early: still goes with crew A
    { profile_id: null, name: "Contractor Z", crew_id: null, installation_id: "juliet", demob_date: "2026-10-06" },
  ];
  const visits: DayVisit[] = [
    { id: "v1", visitor_name: "Auditor", status: "approved", installation_id: "juliet", depart_date: "2026-10-06", return_date: "2026-10-08" },
    { id: "v2", visitor_name: "Pending guest", status: "pending", installation_id: "juliet", depart_date: "2026-10-06", return_date: null },
    { id: "v3", visitor_name: "Leaving guest", status: "onboard", installation_id: "juliet", depart_date: "2026-10-01", return_date: "2026-10-06" },
  ];
  const base = { date: "2026-10-06", installationId: "juliet", crews: CREWS, staff: STAFF, onboard, visits };

  it("MOB lists the out-going crews' rotational members and approved visitors, by schedule", () => {
    const due = dueForDay({ ...base, direction: "out" });
    expect(due.map((p) => [p.profile_id ?? p.visit_request_id, p.reason])).toEqual([
      ["a1", "Crew A — due offshore"],
      ["a2", "Crew A — due offshore"],
      ["v1", "Visitor — booked departure"],
    ]);
  });

  it("DEMOB lists the in-coming crews, people outside the rotation on their demob date, and returning visitors", () => {
    const due = dueForDay({ ...base, direction: "in" });
    expect(due.map((p) => [p.profile_id ?? p.visit_request_id ?? p.name, p.reason])).toEqual([
      ["b1", "Crew B — due ashore"],
      ["b2", "Crew B — due ashore"],
      ["j1", "Crew J — due ashore"],
      ["Contractor Z", "On board — demob date"],
      ["x1", "On board — demob date"],
      ["v3", "Visitor — booked return"],
    ]);
  });

  it("keeps other installations' people off the list", () => {
    const due = dueForDay({ ...base, direction: "out", installationId: "kilo" });
    expect(due).toEqual([]);
  });
});

describe("labels", () => {
  it("names the day, the movement and the route", () => {
    expect(dayManifestTitle("2026-10-06", "out", "Juliet")).toBe("Crew change 2026-10-06 · MOB · Shore → Juliet");
    expect(dayManifestTitle("2026-10-06", "in", null)).toBe("Crew change 2026-10-06 · DEMOB · Installation → Shore");
  });

  it("shares a transport only when every crew agrees", () => {
    expect(sharedTransport([{ transport_mode: "BOAT" }, { transport_mode: "boat" }])).toBe("boat");
    expect(sharedTransport([{ transport_mode: "BOAT" }, { transport_mode: null }])).toBe("boat");
    expect(sharedTransport([{ transport_mode: "BOAT" }, { transport_mode: "helicopter" }])).toBeNull();
    expect(sharedTransport([{ transport_mode: null }])).toBeNull();
  });

  it("seats everyone due, at least a helicopter's 12", () => {
    expect([daySeats(3), daySeats(40)]).toEqual([12, 40]);
  });
});
