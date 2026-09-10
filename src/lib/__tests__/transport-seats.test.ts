import { describe, expect, it } from "vitest";
import { canBook, runKey, runsByDate, seatsLeft, upcomingRuns } from "@/lib/transport/seats";
import type { Shuttle } from "@/types/transport";

const shuttle = (id: string, over: Partial<Shuttle> = {}): Shuttle => ({
  id,
  name: id,
  pickup: "Base",
  dropoff: "Airport",
  depart_time: "06:30",
  days_of_week: [1, 2, 3, 4, 5],
  passengers: 8,
  task_type: "passenger",
  driver_id: null,
  driver_name: null,
  vehicle_id: null,
  vehicle_name: null,
  is_active: true,
  ...over,
});

describe("shuttle seats", () => {
  // Thursday 2026-09-10, 08:00 local (07:00Z): the 06:30 run has left.
  const now = "2026-09-10T07:00:00Z";

  it("lists the runs still to depart over the coming days, soonest first", () => {
    const runs = upcomingRuns([shuttle("am"), shuttle("pm", { depart_time: "17:00" }), shuttle("off", { is_active: false })], now, 3);
    expect(runs.map((r) => `${r.shuttle.id} ${r.date}`)).toEqual(["pm 2026-09-10", "am 2026-09-11", "pm 2026-09-11"]);
    expect(runs[0].departAt).toBe("2026-09-10T16:00:00.000Z");
  });

  it("skips weekend days for a weekday shuttle", () => {
    const runs = upcomingRuns([shuttle("am")], "2026-09-11T20:00:00Z", 5); // Fri evening → Fri (gone), Sat, Sun, Mon, Tue
    expect(runs.map((r) => r.date)).toEqual(["2026-09-14", "2026-09-15"]);
  });

  it("counts free seats and refuses a full or departed run", () => {
    expect(seatsLeft(8, 3)).toBe(5);
    expect(seatsLeft(8, 9)).toBe(0);
    const run = { shuttle: shuttle("am"), departAt: "2026-09-11T05:30:00.000Z" };
    expect(canBook(run, 7, now)).toBe(true);
    expect(canBook(run, 8, now)).toBe(false);
    expect(canBook({ ...run, departAt: "2026-09-10T05:30:00.000Z" }, 0, now)).toBe(false);
  });

  it("groups runs by date and keys a run", () => {
    const runs = upcomingRuns([shuttle("am"), shuttle("pm", { depart_time: "17:00" })], now, 2);
    expect(runsByDate(runs).map((g) => [g.date, g.runs.length])).toEqual([
      ["2026-09-10", 1],
      ["2026-09-11", 2],
    ]);
    expect(runKey("am", "2026-09-10")).toBe("am|2026-09-10");
  });
});
