import { describe, expect, it } from "vitest";
import {
  buildAssignmentGrid,
  gridTable,
  liveCounts,
  monthBounds,
  shiftMonth,
  tallyError,
  type LiveTask,
  type RecordedRow,
  type SheetDriver,
} from "@/lib/transport/daily-assignments";

const drv = (id: string, sort_order: number | null, active = true): SheetDriver => ({ id, name: `Driver ${id}`, active, sort_order });
const DRIVERS = [drv("b", 2), drv("a", 1), drv("old", 3, false), drv("new", null)];
const rec = (day: string, driver_id: string, assignments: number, source: RecordedRow["source"] = "import"): RecordedRow => ({ day, driver_id, assignments, source });
const task = (depart_at: string, driver_id: string | null, status = "completed"): LiveTask => ({ depart_at, driver_id, status });

describe("month helpers", () => {
  it("moves across years and knows each month's last day", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
  });
});

describe("weeks as on the sheet", () => {
  it("starts Week 1 on the 1st and a new week every Monday", () => {
    const g = buildAssignmentGrid({ month: "2026-01", today: "2026-09-25", drivers: DRIVERS, recorded: [], tasks: [] });
    expect(g.days).toHaveLength(22);
    expect(g.days.slice(0, 3).map((d) => `${d.week} ${d.weekday} ${d.date}`)).toEqual(["1 Thu 2026-01-01", "1 Fri 2026-01-02", "2 Mon 2026-01-05"]);
    expect(g.days[0]).toMatchObject({ firstOfWeek: true, weekSpan: 2 });
    expect(g.days[2]).toMatchObject({ firstOfWeek: true, weekSpan: 5 });
    expect(g.days.at(-1)).toMatchObject({ week: 5, weekday: "Fri", date: "2026-01-30" });
    const may = buildAssignmentGrid({ month: "2026-05", today: "2026-09-25", drivers: DRIVERS, recorded: [], tasks: [] });
    expect(may.days[0]).toMatchObject({ week: 1, weekday: "Fri", weekSpan: 1 });
  });

  it("shows a weekend day only when someone worked it, in the week before", () => {
    const g = buildAssignmentGrid({
      month: "2026-09",
      today: "2026-09-25",
      drivers: DRIVERS,
      recorded: [rec("2026-09-05", "a", 2, "tally")],
      tasks: [],
    });
    const sat = g.days.find((d) => d.date === "2026-09-05");
    expect(sat).toMatchObject({ weekday: "Sat", week: 1, total: 2 });
    expect(g.days.some((d) => d.date === "2026-09-06")).toBe(false);
  });
});

describe("where each day's counts come from", () => {
  const recorded = [rec("2026-09-01", "a", 3), rec("2026-09-01", "b", 0), rec("2026-09-02", "a", 1, "tally"), rec("2026-09-02", "b", 2, "tally")];
  const tasks = [
    task("2026-09-01T08:00:00Z", "a"), // ignored: 1 Sep is recorded
    task("2026-09-03T07:00:00Z", "a"),
    task("2026-09-03T09:00:00Z", "a", "no_show"),
    task("2026-09-03T10:00:00Z", "b", "cancelled"),
    task("2026-09-03T11:00:00Z", "b", "pending"),
    task("2026-09-30T07:00:00Z", "b", "assigned"), // still to come
  ];
  const g = buildAssignmentGrid({ month: "2026-09", today: "2026-09-25", drivers: DRIVERS, recorded, tasks });
  const day = (d: string) => g.days.find((x) => x.date === d)!;

  it("uses the recorded tally, else portal tasks, else flags the gap", () => {
    expect(day("2026-09-01")).toMatchObject({ source: "import", counts: { a: 3 }, total: 3 });
    expect(day("2026-09-02")).toMatchObject({ source: "tally", counts: { a: 1, b: 2 }, total: 3 });
    expect(day("2026-09-03")).toMatchObject({ source: "portal", counts: { a: 2 }, total: 2 });
    expect(day("2026-09-04")).toMatchObject({ source: "none", total: 0 });
    expect(day("2026-09-30")).toMatchObject({ source: "upcoming", counts: {}, total: 0 });
  });

  it("totals per driver and for the month, and counts the gaps", () => {
    expect(g.drivers.map((d) => [d.id, d.total])).toEqual([
      ["a", 6],
      ["b", 2],
      ["new", 0],
    ]);
    expect([g.total, g.recordedDays, g.workedDays]).toEqual([8, 2, 3]);
    // Weekdays 4–25 Sep with nothing: 4, 7–11, 14–18, 21–25.
    expect(g.missingDays).toBe(16);
  });

  it("counts a late-evening UTC departure on the site-clock day", () => {
    const m = liveCounts([task("2026-09-07T23:30:00Z", "a")]);
    expect(m.get("2026-09-08")?.get("a")).toBe(1);
  });
});

describe("columns", () => {
  it("keeps a past month to the drivers who were on it, in the desk's order", () => {
    const g = buildAssignmentGrid({
      month: "2026-01",
      today: "2026-09-25",
      drivers: DRIVERS,
      recorded: [rec("2026-01-02", "old", 2), rec("2026-01-02", "b", 1), rec("2026-01-02", "a", 0)],
      tasks: [],
    });
    expect(g.drivers.map((d) => d.id)).toEqual(["a", "b", "old"]);
  });

  it("opens the current month with the active roster", () => {
    const g = buildAssignmentGrid({ month: "2026-10", today: "2026-10-01", drivers: DRIVERS, recorded: [], tasks: [] });
    expect(g.drivers.map((d) => d.id)).toEqual(["a", "b", "new"]);
  });
});

describe("the CSV in the workbook's layout", () => {
  it("has a title, a header, a row per day with blanks for zero, and a totals row", () => {
    const g = buildAssignmentGrid({
      month: "2026-01",
      today: "2026-09-25",
      drivers: DRIVERS,
      recorded: [rec("2026-01-01", "a", 0), rec("2026-01-01", "b", 0), rec("2026-01-02", "a", 2), rec("2026-01-02", "b", 1)],
      tasks: [],
    });
    const t = gridTable(g);
    expect(t[0]).toEqual(["Daily Assignments Monitoring — January 2026"]);
    expect(t[1]).toEqual(["Week", "Day", "Date", "Driver a", "Driver b", "Total"]);
    expect(t[2]).toEqual(["Week 1", "Thu", "2026-01-01", "", "", "0"]);
    expect(t[3]).toEqual(["", "Fri", "2026-01-02", "2", "1", "3"]);
    expect(t.at(-1)).toEqual(["Total", "", "", "2", "1", "3"]);
  });
});

describe("recording a day", () => {
  it("accepts whole counts for a past or present day only", () => {
    const ok = [{ driverId: "a", n: 3 }, { driverId: "b", n: 0 }];
    expect(tallyError("2026-09-25", "2026-09-25", ok)).toBeNull();
    expect(tallyError("2026-09-26", "2026-09-25", ok)).toMatch(/still to come/);
    expect(tallyError("25/09/2026", "2026-09-25", ok)).toMatch(/Pick a date/);
    expect(tallyError("2026-09-25", "2026-09-25", [{ driverId: "a", n: 1.5 }])).toMatch(/whole number/);
    expect(tallyError("2026-09-25", "2026-09-25", [{ driverId: "a", n: 100 }])).toMatch(/whole number/);
    expect(tallyError("2026-09-25", "2026-09-25", [{ driverId: "a", n: 1 }, { driverId: "a", n: 2 }])).toMatch(/twice/);
    expect(tallyError("2026-09-25", "2026-09-25", [])).toMatch(/No driver/);
  });
});
