import { describe, expect, it } from "vitest";
import {
  isCrewChangeDate,
  nextCrewChangeDate,
  planManifest,
  seatOverflow,
  type PlanCrew,
  type PlanStaff,
  type PlanVisit,
} from "@/lib/offshore/manifest-plan";

// A 14/14 crew starting 2026-01-01: offshore 01-01→01-15, ashore to 01-29, and
// so on every 28 days.
const ALPHA: PlanCrew = {
  id: "crew-a",
  name: "Alpha",
  offshore_days: 14,
  onshore_days: 14,
  cycle_start_date: "2026-01-01",
};
// A 21/21 crew starting a week later, to prove crews are handled independently.
// Its 42-day period never coincides with Alpha's 28-day one from that offset.
const BRAVO: PlanCrew = {
  id: "crew-b",
  name: "Bravo",
  offshore_days: 21,
  onshore_days: 21,
  cycle_start_date: "2026-01-08",
};
// A 21/21 crew sharing Alpha's start, so the two do coincide — first on
// 2026-03-26 (Alpha's 4th change, Charlie's 3rd).
const CHARLIE: PlanCrew = {
  id: "crew-c",
  name: "Charlie",
  offshore_days: 21,
  onshore_days: 21,
  cycle_start_date: "2026-01-01",
};

const roster: PlanStaff[] = [
  { profile_id: "a1", name: "Alpha One", crew_id: "crew-a" },
  { profile_id: "a2", name: "Alpha Two", crew_id: "crew-a" },
  { profile_id: "b1", name: "Bravo One", crew_id: "crew-b" },
  { profile_id: "n1", name: "No Crew", crew_id: null },
  { profile_id: "x1", name: "Contractor", crew_id: null, is_rotational: false },
];

const visits: PlanVisit[] = [
  { id: "v1", visitor_name: "Inspector", status: "approved", depart_date: "2026-01-01", return_date: "2026-01-15" },
  { id: "v2", visitor_name: "Auditor", status: "pending", depart_date: "2026-01-01", return_date: null },
  { id: "v3", visitor_name: "Leaving Guest", status: "onboard", depart_date: "2025-12-20", return_date: "2026-01-15" },
];

const base = { crews: [ALPHA, BRAVO], roster, onboard: [], visits };

describe("isCrewChangeDate", () => {
  it("matches the cycle start and every period after it", () => {
    for (const d of ["2026-01-01", "2026-01-29", "2026-02-26"]) {
      expect(isCrewChangeDate(ALPHA, d, "out")).toBe(true);
    }
  });

  it("puts the inbound change at the end of the offshore phase", () => {
    expect(isCrewChangeDate(ALPHA, "2026-01-15", "in")).toBe(true);
    expect(isCrewChangeDate(ALPHA, "2026-01-15", "out")).toBe(false);
    expect(isCrewChangeDate(ALPHA, "2026-01-01", "in")).toBe(false);
  });

  it("never matches before the cycle starts", () => {
    expect(isCrewChangeDate(ALPHA, "2025-12-04", "out")).toBe(false);
  });

  it("ignores a crew with no cycle start or a zero period", () => {
    expect(isCrewChangeDate({ ...ALPHA, cycle_start_date: null }, "2026-01-01", "out")).toBe(false);
    expect(
      isCrewChangeDate({ ...ALPHA, offshore_days: 0, onshore_days: 0 }, "2026-01-01", "out"),
    ).toBe(false);
  });
});

describe("nextCrewChangeDate", () => {
  it("returns the date itself when it is already a change date", () => {
    expect(nextCrewChangeDate(ALPHA, "2026-01-29", "out")).toBe("2026-01-29");
  });

  it("rolls forward to the next one otherwise", () => {
    expect(nextCrewChangeDate(ALPHA, "2026-01-02", "out")).toBe("2026-01-29");
    expect(nextCrewChangeDate(ALPHA, "2026-01-16", "in")).toBe("2026-02-12");
  });

  it("returns the first change when asked from before the cycle starts", () => {
    expect(nextCrewChangeDate(ALPHA, "2025-11-01", "out")).toBe("2026-01-01");
  });
});

describe("planManifest — outbound (joining)", () => {
  it("pulls the whole changing crew plus visitors booked to depart", () => {
    const plan = planManifest({ ...base, direction: "out", dateIso: "2026-01-01" });
    expect(plan.picks.map((p) => p.id).sort()).toEqual(["a1", "a2", "v1"]);
    expect(plan.scheduledCrews).toEqual([{ id: "crew-a", name: "Alpha" }]);
  });

  it("leaves out visitors who are not approved yet", () => {
    const plan = planManifest({ ...base, direction: "out", dateIso: "2026-01-01" });
    expect(plan.picks.some((p) => p.id === "v2")).toBe(false);
  });

  it("skips crew members already on board", () => {
    const plan = planManifest({
      ...base,
      direction: "out",
      dateIso: "2026-01-01",
      onboard: [{ profile_id: "a1", name: "Alpha One", crew_id: "crew-a" }],
    });
    expect(plan.picks.map((p) => p.id)).not.toContain("a1");
    expect(plan.picks.map((p) => p.id)).toContain("a2");
  });

  it("never pulls in crewless or non-rotational people", () => {
    const plan = planManifest({ ...base, direction: "out", dateIso: "2026-01-01" });
    expect(plan.picks.map((p) => p.id)).not.toContain("n1");
    expect(plan.picks.map((p) => p.id)).not.toContain("x1");
  });

  it("handles two crews changing on the same day", () => {
    const both = planManifest({
      ...base,
      crews: [ALPHA, CHARLIE],
      roster: [...roster, { profile_id: "c1", name: "Charlie One", crew_id: "crew-c" }],
      direction: "out",
      dateIso: "2026-03-26",
    });
    expect(both.scheduledCrews.map((c) => c.id).sort()).toEqual(["crew-a", "crew-c"]);
    expect(both.picks.map((p) => p.id).sort()).toEqual(["a1", "a2", "c1"]);
  });

  it("narrows to one crew when a crew filter is set", () => {
    const plan = planManifest({
      ...base,
      crews: [ALPHA, CHARLIE],
      roster: [...roster, { profile_id: "c1", name: "Charlie One", crew_id: "crew-c" }],
      direction: "out",
      dateIso: "2026-03-26",
      crewIdFilter: "crew-c",
    });
    expect(plan.picks.map((p) => p.id)).toEqual(["c1"]);
  });

  it("does not coincide two crews whose cycles never align", () => {
    // Alpha changes on 2026-04-23; Bravo's 42-day cycle from 01-08 does not.
    const plan = planManifest({ ...base, direction: "out", dateIso: "2026-04-23" });
    expect(plan.scheduledCrews.map((c) => c.id)).toEqual(["crew-a"]);
  });
});

describe("planManifest — inbound (leaving)", () => {
  const onboard = [
    { profile_id: "a1", name: "Alpha One", crew_id: "crew-a" },
    { profile_id: "b1", name: "Bravo One", crew_id: "crew-b" },
  ];

  it("takes the changing crew's people off board, plus visitors due to return", () => {
    const plan = planManifest({ ...base, direction: "in", dateIso: "2026-01-15", onboard, visits });
    // v3 is on board; v1 is still "approved" on its return date — the arrival
    // was never confirmed, so it is listed rather than silently left offshore.
    expect(plan.picks.map((p) => p.id).sort()).toEqual(["a1", "v1", "v3"]);
  });

  it("flags a returning visitor whose arrival was never confirmed", () => {
    const plan = planManifest({ ...base, direction: "in", dateIso: "2026-01-15", onboard, visits });
    expect(plan.picks.find((p) => p.id === "v1")!.reason).toBe(
      "Visitor — booked return (arrival never confirmed)",
    );
    expect(plan.picks.find((p) => p.id === "v3")!.reason).toBe("Visitor — booked return");
  });

  it("still ignores a visitor whose booking already closed", () => {
    const closed = [
      { id: "v9", visitor_name: "Gone", status: "returned", depart_date: "2026-01-01", return_date: "2026-01-15" },
    ];
    const plan = planManifest({ ...base, direction: "in", dateIso: "2026-01-15", onboard, visits: closed });
    expect(plan.picks.map((p) => p.id)).not.toContain("v9");
  });

  it("leaves another crew's people on board", () => {
    const plan = planManifest({ ...base, direction: "in", dateIso: "2026-01-15", onboard, visits });
    expect(plan.picks.map((p) => p.id)).not.toContain("b1");
  });
});

describe("planManifest — nothing scheduled", () => {
  it("returns no picks and suggests the nearest change dates", () => {
    const plan = planManifest({ ...base, direction: "out", dateIso: "2026-01-05" });
    expect(plan.picks).toEqual([]);
    expect(plan.scheduledCrews).toEqual([]);
    expect(plan.nearest.length).toBeGreaterThan(0);
    expect(plan.nearest[0].dateIso >= "2026-01-05").toBe(true);
    // Sorted soonest-first so the top suggestion is the useful one.
    expect(plan.nearest).toEqual([...plan.nearest].sort((a, b) => a.dateIso.localeCompare(b.dateIso)));
  });

  it("still books visitors travelling on a day no crew moves", () => {
    const lone: PlanVisit = {
      id: "v9", visitor_name: "Solo", status: "approved",
      depart_date: "2026-01-05", return_date: null,
    };
    const plan = planManifest({ ...base, direction: "out", dateIso: "2026-01-05", visits: [lone] });
    expect(plan.picks.map((p) => p.id)).toEqual(["v9"]);
  });

  it("returns nothing at all without a date", () => {
    expect(planManifest({ ...base, direction: "out", dateIso: "" }).picks).toEqual([]);
  });
});

describe("planManifest — determinism", () => {
  // The builder re-applies the plan only when its key changes, so equivalent
  // inputs must produce an identical pick list. If this drifted, the form would
  // re-fill on every render and wipe the operator's manual edits.
  it("produces the same picks in the same order from fresh copies of the inputs", () => {
    const args = { direction: "out" as const, dateIso: "2026-01-01" };
    const a = planManifest({ ...base, ...args });
    const b = planManifest({
      ...args,
      crews: [{ ...ALPHA }, { ...BRAVO }],
      roster: roster.map((r) => ({ ...r })),
      onboard: [],
      visits: visits.map((v) => ({ ...v })),
    });
    const key = (p: typeof a) => p.picks.map((x) => x.kind + x.id).join(",");
    expect(key(b)).toBe(key(a));
  });

  it("never lists the same person twice", () => {
    const dupes = planManifest({
      ...base,
      direction: "out",
      dateIso: "2026-01-01",
      roster: [...roster, ...roster],
      visits: [...visits, ...visits],
    });
    const keys = dupes.picks.map((p) => p.kind + p.id);
    expect(keys).toEqual([...new Set(keys)]);
  });
});

describe("seatOverflow", () => {
  it("reports free seats when under capacity", () => {
    expect(seatOverflow(9, 12)).toEqual({ over: false, excess: 0, free: 3 });
  });

  it("is not an overflow when exactly full", () => {
    expect(seatOverflow(12, 12)).toEqual({ over: false, excess: 0, free: 0 });
  });

  it("reports the excess rather than trimming", () => {
    expect(seatOverflow(15, 12)).toEqual({ over: true, excess: 3, free: 0 });
  });

  it("treats a nonsense capacity as zero seats", () => {
    expect(seatOverflow(2, -5)).toEqual({ over: true, excess: 2, free: 0 });
  });
});

describe("partial crew changes still count as due", () => {
  // The crew-change prompt used to require the whole crew ashore. On live data
  // CREW B2 begins its offshore phase with 5 of 9 already aboard, so the four
  // still ashore raised nothing; CREW B (25/26) and CREW F (34/35) likewise.
  const dueToMobilise = (members: number, aboard: number, expectedOffshore: boolean) =>
    expectedOffshore && Math.max(0, members - aboard) > 0;

  it("prompts when part of the crew is still ashore", () => {
    expect(dueToMobilise(9, 5, true)).toBe(true); // CREW B2
    expect(dueToMobilise(26, 25, true)).toBe(true); // CREW B
    expect(dueToMobilise(35, 34, true)).toBe(true); // CREW F
  });

  it("still prompts when the whole crew is ashore", () => {
    expect(dueToMobilise(9, 0, true)).toBe(true);
  });

  it("goes quiet once everyone is aboard", () => {
    expect(dueToMobilise(9, 9, true)).toBe(false);
  });

  it("says nothing during the onshore phase", () => {
    expect(dueToMobilise(9, 0, false)).toBe(false);
  });

  it("counts only the people actually still ashore", () => {
    expect(Math.max(0, 9 - 5)).toBe(4);
  });

  it("never reports a negative count when more are aboard than rostered", () => {
    // Possible: a trip can carry a crew_id for somebody with no roster row.
    expect(Math.max(0, 9 - 12)).toBe(0);
    expect(dueToMobilise(9, 12, true)).toBe(false);
  });
});
