import { describe, expect, it } from "vitest";
import { cycleDayIndex, nextChangeDate, scheduleWindow } from "@/lib/offshore/rotation-math";

// A classic 14/14 rotation that started on 2026-01-01.
const CYCLE = { offshore_days: 14, onshore_days: 14, cycle_start_date: "2026-01-01" };

describe("cycleDayIndex", () => {
  it("is 0 on the cycle start day", () => {
    expect(cycleDayIndex(CYCLE, "2026-01-01")).toBe(0);
  });

  it("counts through the offshore phase", () => {
    expect(cycleDayIndex(CYCLE, "2026-01-08")).toBe(7);
    expect(cycleDayIndex(CYCLE, "2026-01-14")).toBe(13);
  });

  it("rolls into the onshore phase and wraps at the period", () => {
    expect(cycleDayIndex(CYCLE, "2026-01-15")).toBe(14); // first onshore day
    expect(cycleDayIndex(CYCLE, "2026-01-29")).toBe(0); // next rotation starts
  });

  it("handles a cycle start in the future (negative offsets)", () => {
    expect(cycleDayIndex(CYCLE, "2025-12-31")).toBe(27); // day before start = last day of previous period
  });

  it("is null without a usable cycle", () => {
    expect(cycleDayIndex({ ...CYCLE, cycle_start_date: null }, "2026-01-01")).toBeNull();
    expect(
      cycleDayIndex({ offshore_days: 0, onshore_days: 0, cycle_start_date: "2026-01-01" }, "2026-01-02"),
    ).toBeNull();
  });
});

describe("scheduleWindow", () => {
  it("backdates the window to the phase start when mid-offshore", () => {
    expect(scheduleWindow(CYCLE, "2026-01-08")).toEqual({
      fromIso: "2026-01-01",
      toIso: "2026-01-15",
    });
  });

  it("uses the full phase when boarding on day one", () => {
    expect(scheduleWindow(CYCLE, "2026-01-29")).toEqual({
      fromIso: "2026-01-29",
      toIso: "2026-02-12",
    });
  });

  it("falls back to [today, today + offshore] during the onshore phase", () => {
    expect(scheduleWindow(CYCLE, "2026-01-20")).toEqual({
      fromIso: "2026-01-20",
      toIso: "2026-02-03",
    });
  });

  it("falls back to [today, today + offshore] without a cycle start", () => {
    expect(
      scheduleWindow({ offshore_days: 21, onshore_days: 21, cycle_start_date: null }, "2026-03-05"),
    ).toEqual({ fromIso: "2026-03-05", toIso: "2026-03-26" });
  });

  it("supports asymmetric rotations (28/14)", () => {
    const cycle = { offshore_days: 28, onshore_days: 14, cycle_start_date: "2026-01-01" };
    // Day 30 of the 42-day period → onshore.
    expect(scheduleWindow(cycle, "2026-01-31")).toEqual({
      fromIso: "2026-01-31",
      toIso: "2026-02-28",
    });
    // Second rotation, 3 days in → window backdated to Feb 12.
    expect(scheduleWindow(cycle, "2026-02-15")).toEqual({
      fromIso: "2026-02-12",
      toIso: "2026-03-12",
    });
  });
});

describe("nextChangeDate", () => {
  it("returns the start itself when it is today or in the future", () => {
    expect(nextChangeDate(CYCLE, "2026-01-01")).toBe("2026-01-01");
    expect(nextChangeDate(CYCLE, "2025-12-20")).toBe("2026-01-01");
  });

  it("returns the next period boundary once the cycle has started", () => {
    expect(nextChangeDate(CYCLE, "2026-01-02")).toBe("2026-01-29");
    expect(nextChangeDate(CYCLE, "2026-01-28")).toBe("2026-01-29");
    // A rotation-boundary day is itself the change date.
    expect(nextChangeDate(CYCLE, "2026-01-29")).toBe("2026-01-29");
    expect(nextChangeDate(CYCLE, "2026-01-30")).toBe("2026-02-26");
  });

  it("is null without a usable cycle", () => {
    expect(nextChangeDate({ ...CYCLE, cycle_start_date: null }, "2026-01-01")).toBeNull();
    expect(
      nextChangeDate({ offshore_days: 0, onshore_days: 0, cycle_start_date: "2026-01-01" }, "2026-01-01"),
    ).toBeNull();
  });
});
