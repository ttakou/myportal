import { describe, expect, it } from "vitest";
import { crewStatus, currentCrewChange, tripOnBoard } from "@/lib/offshore/crew-change";

// CREW H as it stands: 28 on, 28 off, cycle started 23 May 2026.
const CREW_H = { offshore_days: 28, onshore_days: 28, cycle_start_date: "2026-05-23" };

describe("currentCrewChange", () => {
  it("places 7 September in the onshore half, with the next hitch on 12 September", () => {
    // 107 days after the cycle start: day 51 of a 56-day period, so 23 days
    // into the onshore half. Henry's actual demob was 25 Aug; the schedule
    // does not care.
    expect(currentCrewChange(CREW_H, "2026-09-07")).toEqual({
      phase: "onshore",
      hitchFrom: "2026-09-12",
      hitchTo: "2026-10-10",
      nextChange: "2026-09-12",
      daysToChange: 5,
      onshoreSince: "2026-08-15",
    });
  });

  it("places a day inside the hitch as offshore, backdated to its start", () => {
    expect(currentCrewChange(CREW_H, "2026-07-30")).toEqual({
      phase: "offshore",
      hitchFrom: "2026-07-18",
      hitchTo: "2026-08-15",
      nextChange: "2026-08-15",
      daysToChange: 16,
      onshoreSince: null,
    });
  });

  it("counts the crew-change day itself as the start of the new phase", () => {
    const c = currentCrewChange(CREW_H, "2026-09-12");
    expect(c?.phase).toBe("offshore");
    expect(c?.hitchFrom).toBe("2026-09-12");
    expect(c?.daysToChange).toBe(28);
  });

  it("works before the cycle start date", () => {
    // The cycle is periodic in both directions.
    const c = currentCrewChange(CREW_H, "2026-05-01");
    expect(c?.phase).toBe("onshore");
    expect(c?.nextChange).toBe("2026-05-23");
  });

  it("gives null for a crew with no usable cycle", () => {
    expect(currentCrewChange({ ...CREW_H, cycle_start_date: null }, "2026-09-07")).toBeNull();
    expect(
      currentCrewChange({ offshore_days: 0, onshore_days: 0, cycle_start_date: "2026-05-23" }, "2026-09-07"),
    ).toBeNull();
  });
});

describe("tripOnBoard", () => {
  it("trusts an explicit on-board status", () => {
    expect(tripOnBoard({ mobilize: "2026-07-18", demob: "2026-08-15", status: "onboard" }, "2026-09-07")).toBe(true);
  });

  it("is off after a demob or a cancellation", () => {
    expect(tripOnBoard({ mobilize: "2026-07-18", demob: "2026-08-25", status: "demobilised" }, "2026-09-07")).toBe(false);
    expect(tripOnBoard({ mobilize: "2026-07-18", demob: null, status: "cancelled" }, "2026-09-07")).toBe(false);
  });

  it("infers on board from the dates when the status is in flight", () => {
    expect(tripOnBoard({ mobilize: "2026-09-01", demob: "2026-09-29", status: "manifested" }, "2026-09-07")).toBe(true);
    expect(tripOnBoard({ mobilize: "2026-09-12", demob: "2026-10-10", status: "manifested" }, "2026-09-07")).toBe(false);
  });

  it("is off with no trip at all", () => {
    expect(tripOnBoard(null, "2026-09-07")).toBe(false);
  });
});

describe("crewStatus", () => {
  const onshoreNow = currentCrewChange(CREW_H, "2026-09-07")!;
  const offshoreNow = currentCrewChange(CREW_H, "2026-07-30")!;

  it("reads Henry today as onshore, next crew change on the schedule", () => {
    const s = crewStatus(onshoreNow, { mobilize: "2026-07-18", demob: "2026-08-25", status: "demobilised" }, "2026-09-07");
    expect(s.kind).toBe("onshore");
    expect(s.line).toBe("Onshore since 2026-08-15 · next crew change 2026-09-12 (in 5 days)");
    expect(s.note).toBeNull();
  });

  it("does not let a late demob move the next crew change", () => {
    // Came off 25 Aug against a scheduled 15 Aug. The schedule still says
    // 12 Sep; the record's lateness is history, not a new baseline.
    const s = crewStatus(onshoreNow, { mobilize: "2026-07-18", demob: "2026-08-25", status: "demobilised" }, "2026-09-07");
    expect(s.line).toContain("2026-09-12");
  });

  it("notes somebody still on board past the scheduled crew change", () => {
    const s = crewStatus(onshoreNow, { mobilize: "2026-07-18", demob: null, status: "onboard" }, "2026-09-07");
    expect(s.kind).toBe("overdue_off");
    expect(s.line).toContain("next crew change 2026-09-12");
    expect(s.note).toContain("Still on board");
    expect(s.note).toContain("stays on the schedule");
  });

  it("reads somebody offshore in the hitch as offshore", () => {
    const s = crewStatus(offshoreNow, { mobilize: "2026-07-18", demob: "2026-08-15", status: "onboard" }, "2026-07-30");
    expect(s.kind).toBe("offshore");
    expect(s.line).toBe("Offshore · hitch 2026-07-18 → 2026-08-15 · crew change in 16 days");
    expect(s.note).toBeNull();
  });

  it("notes an early return without moving the hitch", () => {
    const s = crewStatus(offshoreNow, { mobilize: "2026-07-18", demob: "2026-07-25", status: "demobilised" }, "2026-07-30");
    expect(s.kind).toBe("off_early");
    expect(s.line).toContain("hitch 2026-07-18 → 2026-08-15");
    expect(s.note).toContain("Came off on 2026-07-25");
  });

  it("notes a hitch with no mobilisation recorded", () => {
    const s = crewStatus(offshoreNow, null, "2026-07-30");
    expect(s.kind).toBe("due_offshore");
    expect(s.note).toBe("No mobilisation recorded for this hitch.");
  });
});
