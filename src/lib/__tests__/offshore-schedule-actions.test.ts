import { describe, expect, it } from "vitest";
import {
  classifyStaleTrips,
  crewChangesAhead,
  crewChangesDueToday,
  reminderForBackToBack,
  reminderForDesk,
  reminderForMember,
  type ScheduledCrew,
} from "@/lib/offshore/schedule-actions";

// CREW H: 28/28 from 23 May 2026. Offshore 23 May–19 Jun, onshore 20 Jun–17 Jul,
// offshore 18 Jul–14 Aug, onshore 15 Aug–11 Sep, offshore from 12 Sep.
const crewH = (members = 2, aboard = 0): ScheduledCrew => ({
  id: "h",
  name: "CREW H",
  cycle: { offshore_days: 28, onshore_days: 28, cycle_start_date: "2026-05-23" },
  members,
  aboard,
});

describe("crewChangesDueToday", () => {
  it("mobilises on the first day of the offshore phase, for those ashore", () => {
    const due = crewChangesDueToday([crewH(2, 0)], "2026-09-12");
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      crewId: "h",
      action: "mobilise",
      date: "2026-09-12",
      count: 2,
      hitchFrom: "2026-09-12",
      hitchTo: "2026-10-10",
    });
  });

  it("leaves an early boarder alone and boards the rest", () => {
    expect(crewChangesDueToday([crewH(2, 1)], "2026-09-12")[0].count).toBe(1);
    expect(crewChangesDueToday([crewH(2, 2)], "2026-09-12")).toEqual([]);
  });

  it("demobilises on the first day of the onshore phase, for those aboard", () => {
    const due = crewChangesDueToday([crewH(2, 2)], "2026-08-15");
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      action: "demobilise",
      count: 2,
      hitchFrom: "2026-08-15",
      hitchTo: "2026-08-15",
    });
    // Nobody aboard: nothing to close.
    expect(crewChangesDueToday([crewH(2, 0)], "2026-08-15")).toEqual([]);
  });

  it("does nothing on any other day, even when the record lags the schedule", () => {
    // Day 2 of the hitch with nobody boarded: the dashboard prompt's job, not
    // a backdated boarding by a job nobody watched.
    expect(crewChangesDueToday([crewH(2, 0)], "2026-09-13")).toEqual([]);
    expect(crewChangesDueToday([crewH(2, 2)], "2026-08-16")).toEqual([]);
  });

  it("skips crews with no members or no cycle", () => {
    expect(crewChangesDueToday([crewH(0, 0)], "2026-09-12")).toEqual([]);
    const noCycle = { ...crewH(), cycle: { ...crewH().cycle, cycle_start_date: null } };
    expect(crewChangesDueToday([noCycle], "2026-09-12")).toEqual([]);
  });
});

describe("crewChangesAhead", () => {
  it("finds a mobilise exactly three days out", () => {
    const ahead = crewChangesAhead([crewH()], "2026-09-09");
    expect(ahead).toHaveLength(1);
    expect(ahead[0]).toMatchObject({ action: "mobilise", date: "2026-09-12" });
    expect(ahead[0].change.hitchTo).toBe("2026-10-10");
  });

  it("finds a demobilise exactly three days out", () => {
    const ahead = crewChangesAhead([crewH(2, 2)], "2026-08-12");
    expect(ahead[0]).toMatchObject({ action: "demobilise", date: "2026-08-15" });
  });

  it("is exact: two or four days out is not a reminder day", () => {
    expect(crewChangesAhead([crewH()], "2026-09-10")).toEqual([]);
    expect(crewChangesAhead([crewH()], "2026-09-08")).toEqual([]);
  });
});

describe("reminder wording", () => {
  const a = crewChangesAhead([crewH()], "2026-09-09")[0];

  it("tells the person where, when and for how long", () => {
    const t = reminderForMember(a, "Juliet");
    expect(t.title).toBe("Crew change in 3 days: CREW H goes offshore on 2026-09-12");
    expect(t.body).toContain("Juliet on 2026-09-12 for 28 days, until 2026-10-10");
  });

  it("tells the back-to-back who is moving", () => {
    expect(reminderForBackToBack(a, "Henry Mforsong").title).toBe(
      "Your back-to-back Henry Mforsong goes offshore on 2026-09-12",
    );
  });

  it("tells the desk whether it must act or the schedule will", () => {
    expect(reminderForDesk(a, 2, true).body).toMatch(/opens this change itself/);
    expect(reminderForDesk(a, 2, false).body).toMatch(/Confirm the change on the dashboard/);
    expect(reminderForDesk(a, 2, false).title).toBe("CREW H: crew change on 2026-09-12 (2 to mobilise)");
  });
});

describe("classifyStaleTrips", () => {
  const today = "2026-09-07";
  it("flags after a week and cancels after a month, only for trips nobody took", () => {
    const { flag, cancel } = classifyStaleTrips(
      [
        { id: "fresh", status: "requested", mobilize_date: "2026-09-05" },
        { id: "week", status: "hse_cleared", mobilize_date: "2026-08-31" },
        { id: "month", status: "manifested", mobilize_date: "2026-08-08" },
        { id: "aboard", status: "onboard", mobilize_date: "2026-07-01" },
        { id: "done", status: "demobilised", mobilize_date: "2026-07-01" },
      ],
      today,
    );
    expect(flag.map((t) => t.id)).toEqual(["week"]);
    expect(cancel.map((t) => t.id)).toEqual(["month"]);
  });

  it("does not both flag and cancel the same trip", () => {
    const { flag, cancel } = classifyStaleTrips(
      [{ id: "old", status: "requested", mobilize_date: "2026-01-01" }],
      today,
    );
    expect(flag).toEqual([]);
    expect(cancel).toHaveLength(1);
  });
});
