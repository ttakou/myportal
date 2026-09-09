import { describe, expect, it } from "vitest";
import { dayRangeIso, localMinutes, localTime, planDay, shiftDate, timelinePct } from "@/lib/transport/day-plan";
import { describeDays, shuttleDepartAt, shuttleRunsOn, shuttlesDue, weekdayOf } from "@/lib/transport/shuttles";
import type { Driver, Shuttle, TransportRequest } from "@/types/transport";

const driver = (id: string, on_duty = true): Driver => ({ id, full_name: id, phone: null, profile_id: null, on_duty });
const req = (over: Partial<TransportRequest> & { id: string; depart_at: string }): TransportRequest => ({
  requester_id: null,
  requester_name: null,
  shuttle_id: null,
  return_of: null,
  created_at: "2026-09-01T00:00:00Z",
  pickup: "A",
  dropoff: "B",
  passengers: 1,
  purpose: null,
  status: "assigned",
  task_type: "passenger",
  priority: "normal",
  notes: null,
  driver_id: null,
  vehicle_id: null,
  driver_name: null,
  driver_phone: null,
  vehicle_name: null,
  started_at: null,
  arrived_at: null,
  completed_at: null,
  log: { odometer_start: null, odometer_end: null, fuel_litres: null, fuel_cost: null },
  rating: null,
  rating_comment: null,
  updates: [],
  checklist: [],
  ...over,
});

describe("local day", () => {
  it("bounds a Douala day in UTC and reads local times", () => {
    expect(dayRangeIso("2026-09-10")).toEqual({ from: "2026-09-09T23:00:00.000Z", to: "2026-09-10T23:00:00.000Z" });
    expect(localTime("2026-09-10T05:30:00Z")).toBe("06:30");
    expect(localMinutes("2026-09-10T05:30:00Z")).toBe(390);
    expect(shiftDate("2026-09-10", -1)).toBe("2026-09-09");
  });

  it("places a task on the 05:00–22:00 timeline", () => {
    expect(timelinePct("2026-09-10T04:00:00Z")).toBe(0); // 05:00 local
    expect(timelinePct("2026-09-10T12:30:00Z")).toBeCloseTo(50, 5); // 13:30 local
    expect(timelinePct("2026-09-10T22:00:00Z")).toBe(100); // past the end, clamped
  });
});

describe("planDay", () => {
  it("lanes tasks per driver, on-duty first, and piles the unassigned", () => {
    const plan = planDay(
      [
        req({ id: "a", depart_at: "2026-09-10T07:00:00Z", driver_id: "bob" }),
        req({ id: "b", depart_at: "2026-09-10T06:00:00Z", driver_id: "ann" }),
        req({ id: "c", depart_at: "2026-09-10T09:00:00Z", status: "pending" }),
        req({ id: "d", depart_at: "2026-09-10T10:00:00Z", status: "cancelled" }),
      ],
      [driver("bob", false), driver("ann", true)],
    );
    expect(plan.lanes.map((l) => l.driver.id)).toEqual(["ann", "bob"]);
    expect(plan.unassigned.map((r) => r.id)).toEqual(["c"]);
    expect(plan.liveCount).toBe(3);
  });

  it("flags two live tasks within the clash window in one lane, ignoring done ones", () => {
    const plan = planDay(
      [
        req({ id: "a", depart_at: "2026-09-10T07:00:00Z", driver_id: "ann" }),
        req({ id: "b", depart_at: "2026-09-10T07:30:00Z", driver_id: "ann" }),
        req({ id: "c", depart_at: "2026-09-10T10:00:00Z", driver_id: "ann" }),
        req({ id: "d", depart_at: "2026-09-10T10:10:00Z", driver_id: "ann", status: "completed" }),
      ],
      [driver("ann")],
      60,
    );
    expect([...plan.lanes[0].clashing].sort()).toEqual(["a", "b"]);
  });

  it("keeps a task whose driver is off the list rather than losing it", () => {
    const plan = planDay([req({ id: "a", depart_at: "2026-09-10T07:00:00Z", driver_id: "gone" })], [driver("ann")]);
    expect(plan.orphaned.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("shuttles", () => {
  const shuttle: Shuttle = {
    id: "s",
    name: "Airport run",
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
  };

  it("runs on its weekdays only, and not when switched off", () => {
    expect(weekdayOf("2026-09-10")).toBe(4); // Thursday
    expect(shuttleRunsOn(shuttle, "2026-09-10")).toBe(true);
    expect(shuttleRunsOn(shuttle, "2026-09-12")).toBe(false); // Saturday
    expect(shuttleRunsOn({ ...shuttle, is_active: false }, "2026-09-10")).toBe(false);
  });

  it("departs at the local time, expressed in UTC", () => {
    expect(shuttleDepartAt(shuttle, "2026-09-10")).toBe("2026-09-10T05:30:00.000Z");
  });

  it("describes the days people would say them", () => {
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(describeDays([0, 6])).toBe("Weekends");
    expect(describeDays([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(describeDays([])).toBe("Never");
  });

  it("lists the day's runs soonest first", () => {
    const late = { ...shuttle, id: "l", depart_time: "17:00" };
    expect(shuttlesDue([late, shuttle], "2026-09-10").map((d) => d.shuttle.id)).toEqual(["s", "l"]);
  });
});
