import { describe, expect, it } from "vitest";
import {
  identityOf,
  scheduleStateOf,
  EXCEPTION_STATES,
} from "@/lib/offshore/pob-classify";

// A 21/21 crew whose offshore phase runs 2026-07-16 → 2026-08-06 (CREW A2).
const CYCLE = { offshore_days: 21, onshore_days: 21, cycle_start_date: "2026-07-16" };

describe("identityOf", () => {
  it("calls a rostered rotator rotational staff", () => {
    expect(identityOf({ rostered: true, isRotational: true })).toBe("rotational");
  });

  it("keeps a contractor as staff, not a guest", () => {
    expect(identityOf({ rostered: true, isRotational: false })).toBe("non_rotational");
  });

  it("treats anyone not on the roster as a visitor", () => {
    // Covers casual visitors, approved requests, trips merely marked visitor,
    // and the people aboard with no record at all.
    expect(identityOf({ rostered: false })).toBe("visitor");
    expect(identityOf({ rostered: false, isRotational: null })).toBe("visitor");
  });

  it("defaults a rostered person with no flag to rotational", () => {
    // is_rotational defaults true in the schema; only an explicit false demotes.
    expect(identityOf({ rostered: true })).toBe("rotational");
    expect(identityOf({ rostered: true, isRotational: null })).toBe("rotational");
  });

  it("never depends on the crew — that is the whole point", () => {
    // A rotator between crews is still rotational staff.
    expect(identityOf({ rostered: true, isRotational: true })).toBe("rotational");
  });
});

describe("scheduleStateOf — against the cycle", () => {
  it("is on schedule inside the offshore phase", () => {
    expect(scheduleStateOf({ todayIso: "2026-07-20", cycle: CYCLE })).toBe("on_schedule");
  });

  it("is due ashore on the boundary day, not overstaying", () => {
    // The phase ends today; they are not late until the flight has gone.
    expect(scheduleStateOf({ todayIso: "2026-08-06", cycle: CYCLE })).toBe("due_ashore");
  });

  it("is overstaying once the phase has closed", () => {
    expect(
      scheduleStateOf({ todayIso: "2026-08-10", cycle: CYCLE, mobilizeDate: "2026-07-16" }),
    ).toBe("overstaying");
  });

  it("is early when they boarded after the phase closed", () => {
    // Out ahead of the next window rather than left over from the last one.
    expect(
      scheduleStateOf({ todayIso: "2026-08-10", cycle: CYCLE, mobilizeDate: "2026-08-09" }),
    ).toBe("early");
  });

  it("flags an overstay even with no planned return date", () => {
    // The gap that let somebody stay indefinitely: the Overstayers card only
    // ever checked demob_date, so a null one could never be caught.
    expect(
      scheduleStateOf({ todayIso: "2026-08-10", cycle: CYCLE, demobDate: null, mobilizeDate: "2026-07-16" }),
    ).toBe("overstaying");
  });

  it("is unscheduled with no crew cycle at all", () => {
    expect(scheduleStateOf({ todayIso: "2026-08-06", cycle: null })).toBe("unscheduled");
    expect(
      scheduleStateOf({ todayIso: "2026-08-06", cycle: { ...CYCLE, cycle_start_date: null } }),
    ).toBe("unscheduled");
  });

  it("is unscheduled before the cycle has begun", () => {
    expect(scheduleStateOf({ todayIso: "2026-07-01", cycle: CYCLE })).toBe("unscheduled");
  });

  it("is unscheduled when the pattern is degenerate", () => {
    expect(
      scheduleStateOf({ todayIso: "2026-08-06", cycle: { ...CYCLE, offshore_days: 0, onshore_days: 0 } }),
    ).toBe("unscheduled");
  });

  it("repeats correctly on the next cycle", () => {
    // Second offshore phase runs 2026-08-27 → 2026-09-17.
    expect(scheduleStateOf({ todayIso: "2026-09-01", cycle: CYCLE })).toBe("on_schedule");
    expect(scheduleStateOf({ todayIso: "2026-09-17", cycle: CYCLE })).toBe("due_ashore");
  });
});

describe("scheduleStateOf — a planned return date wins", () => {
  it("overstays once the return date has passed", () => {
    expect(scheduleStateOf({ todayIso: "2026-08-06", demobDate: "2026-06-18", cycle: CYCLE })).toBe(
      "overstaying",
    );
  });

  it("is due ashore on the return date itself", () => {
    expect(scheduleStateOf({ todayIso: "2026-08-06", demobDate: "2026-08-06", cycle: null })).toBe(
      "due_ashore",
    );
  });

  it("falls through to the cycle for a future return date", () => {
    expect(scheduleStateOf({ todayIso: "2026-07-20", demobDate: "2026-08-06", cycle: CYCLE })).toBe(
      "on_schedule",
    );
  });

  it("works for somebody with a return date and no crew at all", () => {
    // A visitor: no cycle, but a booking that has run out.
    expect(scheduleStateOf({ todayIso: "2026-08-06", demobDate: "2026-06-18", cycle: null })).toBe(
      "overstaying",
    );
  });
});

describe("exception states", () => {
  it("treats everything except on-schedule as worth surfacing", () => {
    expect(EXCEPTION_STATES).not.toContain("on_schedule");
    expect(EXCEPTION_STATES).toContain("overstaying");
    expect(EXCEPTION_STATES).toContain("early");
  });
});
