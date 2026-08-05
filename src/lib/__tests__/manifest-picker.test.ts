import { describe, expect, it } from "vitest";
import {
  crewFill,
  manifestCandidates,
  pendingMovements,
  planPicksAsCandidates,
  type PickerOnboard,
  type PickerStaff,
  type PickerVisit,
} from "@/lib/offshore/manifest-picker";

const roster: PickerStaff[] = [
  { profile_id: "a1", name: "Alpha Ashore", crew_id: "A", crew_name: "CREW A", travel_eligible: true },
  { profile_id: "a2", name: "Alpha Aboard", crew_id: "A", crew_name: "CREW A", travel_eligible: true },
  { profile_id: "b1", name: "Bravo Ashore", crew_id: "B", crew_name: "CREW B", travel_eligible: true },
  { profile_id: "n1", name: "No Crew", crew_id: null, crew_name: null, travel_eligible: true },
  { profile_id: "x1", name: "Not Eligible", crew_id: "A", crew_name: "CREW A", travel_eligible: false },
];
const onboard: PickerOnboard[] = [{ profile_id: "a2", crew_id: "A" }];
const visits: PickerVisit[] = [
  { id: "v1", visitor_name: "Approved Guest", status: "approved" },
  { id: "v2", visitor_name: "Aboard Guest", status: "onboard" },
  { id: "v3", visitor_name: "Pending Guest", status: "requested" },
];
const base = { roster, onboard, visits };

describe("manifestCandidates", () => {
  it("offers everyone regardless of where they are — no restriction", () => {
    const out = manifestCandidates({ ...base, direction: "out" });
    const staffIds = out.filter((c) => c.kind === "staff").map((c) => c.id).sort();
    // Both the ashore and the aboard person are selectable on a joining run.
    expect(staffIds).toEqual(["a1", "a2", "b1", "n1"]);
  });

  it("excludes people who are not travel-eligible", () => {
    const out = manifestCandidates({ ...base, direction: "out" });
    expect(out.map((c) => c.id)).not.toContain("x1");
  });

  it("marks an ashore person on a joining run as being mobilised", () => {
    const a1 = manifestCandidates({ ...base, direction: "out" }).find((c) => c.id === "a1")!;
    expect(a1.moves).toBe(true);
    expect(a1.label).toBe("Alpha Ashore · CREW A — ashore · will be mobilised");
  });

  it("does not move someone already aboard on a joining run", () => {
    const a2 = manifestCandidates({ ...base, direction: "out" }).find((c) => c.id === "a2")!;
    expect(a2.moves).toBe(false);
    expect(a2.label).toBe("Alpha Aboard · CREW A — on board");
  });

  it("marks an aboard person on a leaving run as being demobilised", () => {
    const a2 = manifestCandidates({ ...base, direction: "in" }).find((c) => c.id === "a2")!;
    expect(a2.moves).toBe(true);
    expect(a2.label).toBe("Alpha Aboard · CREW A — on board · will be demobilised");
  });

  it("does not move an ashore person on a leaving run", () => {
    const a1 = manifestCandidates({ ...base, direction: "in" }).find((c) => c.id === "a1")!;
    expect(a1.moves).toBe(false);
  });

  it("includes live visitors and never moves them", () => {
    const out = manifestCandidates({ ...base, direction: "out" });
    const v = out.filter((c) => c.kind === "visitor");
    expect(v.map((c) => c.id).sort()).toEqual(["v1", "v2"]);
    expect(v.every((c) => !c.moves)).toBe(true);
  });

  it("leaves out a visitor whose booking is not live", () => {
    expect(manifestCandidates({ ...base, direction: "out" }).map((c) => c.id)).not.toContain("v3");
  });

  it("sorts the people who will move to the top", () => {
    const out = manifestCandidates({ ...base, direction: "out" });
    const lastMover = out.map((c) => c.moves).lastIndexOf(true);
    const firstStatic = out.findIndex((c) => !c.moves);
    expect(lastMover).toBeLessThan(firstStatic);
  });
});

describe("crewFill", () => {
  it("takes a crew's ashore members for a joining run", () => {
    const out = manifestCandidates({ ...base, direction: "out" });
    expect(crewFill(out, "A", "out").map((c) => c.id)).toEqual(["a1"]);
  });

  it("takes a crew's aboard members for a leaving run", () => {
    const inb = manifestCandidates({ ...base, direction: "in" });
    expect(crewFill(inb, "A", "in").map((c) => c.id)).toEqual(["a2"]);
  });

  it("never pulls in another crew or a visitor", () => {
    const out = manifestCandidates({ ...base, direction: "out" });
    const filled = crewFill(out, "A", "out");
    expect(filled.every((c) => c.crew_id === "A" && c.kind === "staff")).toBe(true);
  });

  it("returns nothing for a crew with nobody on the right side", () => {
    const inb = manifestCandidates({ ...base, direction: "in" });
    expect(crewFill(inb, "B", "in")).toEqual([]);
  });
});

describe("pendingMovements", () => {
  it("lists the ashore people a joining run will mobilise", () => {
    const out = manifestCandidates({ ...base, direction: "out" });
    const picked = out.filter((c) => ["a1", "a2", "v1"].includes(c.id));
    const { board, offboard } = pendingMovements(picked, "out");
    expect(board.map((c) => c.id)).toEqual(["a1"]); // a2 already aboard, v1 a visitor
    expect(offboard).toEqual([]);
  });

  it("lists the aboard people a leaving run will demobilise", () => {
    const inb = manifestCandidates({ ...base, direction: "in" });
    const picked = inb.filter((c) => ["a1", "a2"].includes(c.id));
    const { board, offboard } = pendingMovements(picked, "in");
    expect(offboard.map((c) => c.id)).toEqual(["a2"]);
    expect(board).toEqual([]);
  });

  it("reports nothing when every pick is already in the right state", () => {
    const out = manifestCandidates({ ...base, direction: "out" });
    const picked = out.filter((c) => c.id === "a2");
    expect(pendingMovements(picked, "out")).toEqual({ board: [], offboard: [] });
  });

  it("never moves a visitor in either direction", () => {
    for (const d of ["out", "in"] as const) {
      const list = manifestCandidates({ ...base, direction: d });
      const picked = list.filter((c) => c.kind === "visitor");
      expect(pendingMovements(picked, d)).toEqual({ board: [], offboard: [] });
    }
  });
});

describe("planPicksAsCandidates — nobody is dropped", () => {
  const all = manifestCandidates({ ...base, direction: "in" });
  const aboard = new Set(["a2", "ghost"]);

  it("keeps a scheduled person who has no roster row", () => {
    // Production has 50 people on board holding no offshore_staff row; the
    // schedule finds them via live trips, the candidate list cannot.
    const picks = [{ id: "ghost", name: "Unrostered Aboard", kind: "staff" as const, crew_id: "A" }];
    const out = planPicksAsCandidates(picks, all, "in", aboard);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Unrostered Aboard");
  });

  it("still marks that person as being demobilised", () => {
    const picks = [{ id: "ghost", name: "Unrostered Aboard", kind: "staff" as const, crew_id: "A" }];
    const out = planPicksAsCandidates(picks, all, "in", aboard);
    expect(out[0].moves).toBe(true);
    expect(out[0].label).toBe("Unrostered Aboard — on board · will be demobilised");
    expect(pendingMovements(out, "in").offboard).toHaveLength(1);
  });

  it("prefers the real candidate when the person IS on the roster", () => {
    const picks = [{ id: "a2", name: "stale name", kind: "staff" as const, crew_id: "A" }];
    const out = planPicksAsCandidates(picks, all, "in", aboard);
    expect(out[0].name).toBe("Alpha Aboard"); // from the roster, not the pick
    expect(out[0].crew_name).toBe("CREW A");
  });

  it("preserves the schedule's order and count exactly", () => {
    const picks = [
      { id: "a2", name: "Alpha Aboard", kind: "staff" as const, crew_id: "A" },
      { id: "ghost", name: "Unrostered", kind: "staff" as const, crew_id: "A" },
      { id: "v2", name: "Aboard Guest", kind: "visitor" as const, crew_id: null },
    ];
    const out = planPicksAsCandidates(picks, all, "in", aboard);
    expect(out.map((c) => c.id)).toEqual(["a2", "ghost", "v2"]);
  });

  it("never marks a visitor as moving", () => {
    const picks = [{ id: "v9", name: "New Guest", kind: "visitor" as const, crew_id: null }];
    const out = planPicksAsCandidates(picks, all, "in", aboard);
    expect(out[0].moves).toBe(false);
  });
});
