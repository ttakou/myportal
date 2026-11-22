import { describe, expect, it } from "vitest";
import {
  checkMove,
  groupPeople,
  firstStatus,
  movesForDay,
  scheduledFor,
  scheduledMovements,
  shiftLabel,
  type DayMove,
} from "@/lib/offshore/movement-change";
import { dueForDay, manifestDays, type DayCrew, type DayStaff } from "@/lib/offshore/day-manifests";
import { pobOutlook, type OutlookCrew } from "@/lib/offshore/pob-outlook";

// 14 on / 14 off from 1 Dec: out 1 Dec, in 15 Dec, out 29 Dec.
const cycle = { offshore_days: 14, onshore_days: 14, cycle_start_date: "2026-12-01" };

describe("the dates a request moves", () => {
  it("offers someone ashore their next mobilisation and the demobilisation of that hitch", () => {
    const m = scheduledMovements({ todayIso: "2026-11-22", cycle, trip: null });
    expect(m).toEqual({ aboard: false, mob: "2026-12-01", demob: "2026-12-15" });
  });

  it("offers someone on board only their coming demobilisation, from the rotation", () => {
    const m = scheduledMovements({ todayIso: "2026-12-05", cycle, trip: { mobilize_date: "2026-12-01", demob_date: "2026-12-15" } });
    expect(m).toEqual({ aboard: true, mob: null, demob: "2026-12-15" });
  });

  it("takes a non-rotational person's demobilisation from their trip", () => {
    const m = scheduledMovements({ todayIso: "2026-12-05", cycle: null, trip: { mobilize_date: "2026-11-01", demob_date: "2026-12-20" } });
    expect(scheduledFor("late_demob", m)).toBe("2026-12-20");
    expect(scheduledFor("early_mob", m)).toBeNull();
  });
});

describe("checking a request", () => {
  const ashore = { aboard: false, mob: "2026-12-01", demob: "2026-12-15" };
  const today = "2026-11-22";
  it("accepts early and late in the right direction", () => {
    expect(checkMove({ kind: "early_mob", movements: ashore, requested: "2026-11-28", todayIso: today })).toBeNull();
    expect(checkMove({ kind: "late_demob", movements: ashore, requested: "2026-12-18", todayIso: today })).toBeNull();
  });
  it("refuses the wrong direction, the same date, a past date", () => {
    expect(checkMove({ kind: "early_mob", movements: ashore, requested: "2026-12-03", todayIso: today })).toMatch(/before/);
    expect(checkMove({ kind: "late_demob", movements: ashore, requested: "2026-12-15", todayIso: today })).toMatch(/already/);
    expect(checkMove({ kind: "early_mob", movements: ashore, requested: "2026-11-20", todayIso: today })).toMatch(/passed/);
  });
  it("keeps a late mobilisation inside the hitch and an early demobilisation after the start", () => {
    expect(checkMove({ kind: "late_mob", movements: ashore, requested: "2026-12-15", todayIso: today })).toMatch(/before the hitch ends/);
    expect(checkMove({ kind: "early_demob", movements: ashore, requested: "2026-12-01", todayIso: today })).toMatch(/after the mobilisation/);
  });
  it("cannot move a mobilisation for someone already on board", () => {
    expect(checkMove({ kind: "late_mob", movements: { aboard: true, mob: null, demob: "2026-12-15" }, requested: "2026-12-02", todayIso: today })).toMatch(/Already on board/);
  });
  it("labels the shift", () => {
    expect(shiftLabel("late_demob", "2026-12-15", "2026-12-18")).toBe("3 days late");
    expect(shiftLabel("early_mob", "2026-12-01", "2026-11-30")).toBe("1 day early");
  });
});

describe("routing", () => {
  it("sends a staff member's own request to their line manager first", () => {
    expect(firstStatus({ selfRaised: true, hasManager: true })).toBe("pending_endorsement");
    expect(firstStatus({ selfRaised: true, hasManager: false })).toBe("pending");
    expect(firstStatus({ selfRaised: false, hasManager: true })).toBe("pending");
  });
});

describe("approved changes on the manifests", () => {
  const crew: DayCrew = { id: "A", name: "CREW A", ...cycle, installation_id: "J", transport_mode: "boat" };
  const staff: DayStaff[] = [
    { profile_id: "p1", name: "Stays on schedule", position: null, crew_id: "A", is_rotational: true },
    { profile_id: "p2", name: "Goes early", position: "Tech", crew_id: "A", is_rotational: true },
  ];
  const moves: DayMove[] = [
    { profile_id: "p2", name: "Goes early", position: "Tech", kind: "early_mob", scheduled_date: "2026-12-01", requested_date: "2026-11-28", installation_id: null },
  ];
  const base = { crews: [crew], staff, onboard: [], visits: [], defaultInstallationId: "J", moves };

  it("takes the person off the crew change and puts them on the new day", () => {
    const crewDay = dueForDay({ ...base, date: "2026-12-01", direction: "out", installationId: "J" }).map((p) => p.profile_id);
    expect(crewDay).toEqual(["p1"]);
    const early = dueForDay({ ...base, date: "2026-11-28", direction: "out", installationId: "J" });
    expect(early.map((p) => [p.profile_id, p.reason])).toEqual([["p2", "Early mobilisation — approved"]]);
  });

  it("makes the new day a manifest day", () => {
    const days = manifestDays({ crews: [crew], staff, visits: [], moves, fromIso: "2026-11-27", days: 6, defaultInstallationId: "J" });
    expect(days.map((d) => `${d.date}:${d.directions.join("+")}:${d.crewDay}`)).toEqual(["2026-11-28:out:false", "2026-12-01:out+in:true"]);
  });

  it("leaves other directions alone", () => {
    expect(movesForDay(moves, "2026-12-01", "in", "J", "J")).toEqual({ skip: new Set(), add: [] });
  });
});

describe("approved changes in the POB outlook", () => {
  const juliet = { id: "J", name: "Juliet", capacity: 10 };
  const crewA: OutlookCrew = { id: "A", name: "A", installationId: "J", offshore_days: 3, onshore_days: 3, cycle_start_date: "2026-12-01", members: ["a1", "a2"] };
  it("counts extra days on board and drops days ashore", () => {
    const o = pobOutlook({
      from: "2026-11-30",
      to: "2026-12-04",
      installations: [juliet],
      crews: [crewA],
      // a1 comes a day early; a2 leaves a day early.
      stays: [{ person: "p:a1", installationId: "J", from: "2026-11-30", to: "2026-12-01", pending: false }],
      away: [{ person: "p:a2", from: "2026-12-03", to: "2026-12-04" }],
      defaultInstallationId: "J",
    })[0];
    expect(o.days.map((d) => d.total)).toEqual([1, 2, 2, 1, 0]);
  });
});

describe("who a leader can raise a request for", () => {
  const offshore = [
    { id: "me", name: "Leader" },
    { id: "a", name: "Ann (direct)" },
    { id: "b", name: "Bob (direct, leads a team)" },
    { id: "c", name: "Cid (under Bob)" },
    { id: "d", name: "Dan (under Cid)" },
    { id: "z", name: "Zoe (elsewhere)" },
  ];
  const line = [
    { profile_id: "a", full_name: "Ann", manager_id: "me", manager_name: "Leader", depth: 1 },
    { profile_id: "b", full_name: "Bob", manager_id: "me", manager_name: "Leader", depth: 1 },
    { profile_id: "c", full_name: "Cid", manager_id: "b", manager_name: "Bob", depth: 2 },
    { profile_id: "d", full_name: "Dan", manager_id: "c", manager_name: "Cid", depth: 3 },
    { profile_id: "x", full_name: "Not offshore", manager_id: "me", manager_name: "Leader", depth: 1 },
  ];
  it("lists the team, each sub-team, then everyone else for the desk", () => {
    const groups = groupPeople({ me: "me", line, offshore, desk: true });
    expect(groups.map((g) => [g.label, g.people.map((p) => p.id)])).toEqual([
      ["My team", ["a", "b"]],
      ["Bob's team", ["c"]],
      ["Cid's team", ["d"]],
      ["All other offshore staff", ["z"]],
    ]);
  });
  it("keeps a line manager outside the desk to their own line", () => {
    expect(groupPeople({ me: "me", line, offshore, desk: false }).map((g) => g.label)).toEqual(["My team", "Bob's team", "Cid's team"]);
  });
  it("gives the desk everyone when they lead no team", () => {
    const groups = groupPeople({ me: "me", line: [], offshore, desk: true });
    expect(groups).toEqual([{ label: "Offshore staff", people: offshore.filter((p) => p.id !== "me").sort((x, y) => x.name.localeCompare(y.name)) }]);
  });
});
