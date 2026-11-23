import { describe, expect, it } from "vitest";
import { nextDays, planBeds, type PlanArrival } from "@/lib/offshore/look-ahead-plan";

const rooms = [
  { id: "d3", label: "Door 3", beds: 2, closed: false },
  { id: "r220", label: "Room 220", beds: 1, closed: false },
  { id: "echo", label: "Echo", beds: 4, closed: false },
  { id: "shut", label: "Room 222", beds: 2, closed: true },
];

describe("planning beds ahead", () => {
  it("frees beds on the demob date and uses them for that day's arrivals", () => {
    const arrivals: Record<string, PlanArrival[]> = {
      "2026-12-01": [
        { key: "a", name: "Alain", crew: "CREW E", cabinId: "r220", until: "2026-12-22" },
        { key: "t", name: "Tibo", crew: "CREW E", cabinId: "d3", until: "2026-12-22" },
        { key: "j", name: "Armel", crew: "CREW J", cabinId: null, until: "2026-12-22" },
      ],
    };
    const plan = planBeds({
      today: "2026-11-23",
      days: ["2026-11-30", "2026-12-01"],
      rooms,
      onboard: [
        { name: "Leaves 1 Dec", roomId: "r220", until: "2026-12-01" },
        { name: "Calistus", roomId: "d3", until: "2026-11-20" }, // overstaying
        { name: "Stays", roomId: "d3", until: "2026-12-10" },
      ],
      arrivalsOn: (d) => arrivals[d] ?? [],
    });
    const day = plan[1];
    expect(day.arrivals.map((a) => [a.name, a.status, a.room])).toEqual([
      ["Alain", "swap", "Room 220"],
      ["Tibo", "conflict", "Echo"],
      ["Armel", "suggest", "Echo"],
    ]);
    const tibo = day.arrivals[1];
    expect(tibo.cabin).toBe("Door 3");
    expect(tibo.blockers).toEqual(["Calistus (overstaying)", "Stays"]);
    expect(tibo.blockedByOverstayer).toBe(true);
    expect(day.short).toBe(0);
    // Echo 4 − 2, Door 3 full, Room 220 full; the closed room counts for nothing.
    expect(day.free).toBe(2);
  });

  it("counts arrivals with nowhere to go as short", () => {
    const plan = planBeds({
      today: "2026-11-23",
      days: ["2026-11-24"],
      rooms: [{ id: "x", label: "X", beds: 1, closed: false }],
      onboard: [],
      arrivalsOn: () => [
        { key: "1", name: "One", crew: null, cabinId: null, until: null },
        { key: "2", name: "Two", crew: null, cabinId: null, until: null },
      ],
    });
    expect(plan[0].arrivals.map((a) => a.status)).toEqual(["suggest", "none"]);
    expect(plan[0].short).toBe(1);
  });

  it("puts a visitor in their booked bed", () => {
    const plan = planBeds({
      today: "2026-11-23",
      days: ["2026-11-24"],
      rooms,
      onboard: [],
      arrivalsOn: () => [{ key: "v", name: "Auditor", crew: null, cabinId: null, until: "2026-11-26", bookedRoomId: "echo" }],
    });
    expect(plan[0].arrivals[0]).toMatchObject({ status: "own", room: "Echo" });
  });

  it("lists the days", () => {
    expect(nextDays("2026-11-30", 3)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
  });
});
