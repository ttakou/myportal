import { describe, expect, it } from "vitest";
import {
  approvalReport,
  driverReport,
  overviewReport,
  peakReport,
  requesterReport,
  routeReport,
  shuttleReport,
  startDelayMin,
  vehicleReport,
  type ReportRow,
} from "@/lib/transport/reports";

const row = (over: Partial<ReportRow> & { id: string }): ReportRow => ({
  status: "completed",
  task_type: "passenger",
  priority: "normal",
  created_at: "2026-09-08T06:00:00Z",
  depart_at: "2026-09-08T07:00:00Z", // Tue 08:00 local
  started_at: "2026-09-08T07:05:00Z",
  arrived_at: null,
  completed_at: "2026-09-08T08:00:00Z",
  approved_at: null,
  pickup: "Base",
  dropoff: "Airport",
  passengers: 1,
  requester_name: "Ann",
  department: "Ops",
  driver_name: "Bob",
  vehicle_name: "Hiace",
  odometer_start: 100,
  odometer_end: 140,
  fuel_litres: 4,
  fuel_cost: 3000,
  rating: 5,
  shuttle_id: null,
  shuttle_date: null,
  return_of: null,
  ...over,
});

const ROWS: ReportRow[] = [
  row({ id: "a" }),
  row({ id: "b", depart_at: "2026-09-09T12:00:00Z", started_at: "2026-09-09T12:40:00Z", rating: 3, requester_name: "Cy", department: "HSE", passengers: 3, dropoff: "Port", odometer_start: null, odometer_end: null, fuel_litres: null, fuel_cost: null }),
  row({ id: "c", status: "cancelled", started_at: null, completed_at: null, rating: null, depart_at: "2026-09-09T13:00:00Z" }),
  row({ id: "d", status: "no_show", started_at: "2026-09-10T07:00:00Z", completed_at: "2026-09-10T07:30:00Z", rating: null, depart_at: "2026-09-10T07:00:00Z", driver_name: "Dee", vehicle_name: "Prado", odometer_start: null, odometer_end: null, fuel_litres: 10, fuel_cost: 7000 }),
  row({ id: "e", status: "assigned", started_at: null, completed_at: null, rating: null, depart_at: "2026-09-01T07:00:00Z", odometer_start: null, odometer_end: null, fuel_litres: null, fuel_cost: null }),
  row({ id: "f", status: "awaiting_approval", started_at: null, completed_at: null, rating: null, driver_name: null, vehicle_name: null, depart_at: "2026-09-12T07:00:00Z", created_at: "2026-09-10T06:00:00Z" }),
  row({ id: "g", approved_at: "2026-09-08T10:00:00Z", created_at: "2026-09-08T06:00:00Z", depart_at: "2026-09-11T07:00:00Z", started_at: "2026-09-11T07:02:00Z", completed_at: "2026-09-11T08:00:00Z", shuttle_id: "s1", shuttle_date: "2026-09-11", return_of: "a" }),
];

describe("overview", () => {
  it("counts outcomes, punctuality, ratings and the daily series on the site clock", () => {
    const o = overviewReport(ROWS, "2026-09-08", "2026-09-12", { nowIso: "2026-09-10T12:00:00Z", onTimeMinutes: 15 });
    expect(o.total).toBe(7);
    expect([o.completed, o.cancelled, o.noShows, o.open, o.overdue]).toEqual([3, 1, 1, 2, 1]);
    expect(o.completionRate).toBe(60); // 3 of 5 decided
    expect(o.onTimeRate).toBe(75); // a, d, g on time; b 40 min late
    expect(o.avgStartDelayMin).toBe(12); // (5 + 40 + 0 + 2) / 4
    expect(o.avgRating).toBe(4.3);
    expect(o.shuttleRuns).toBe(1);
    expect(o.returnTrips).toBe(1);
    expect(o.daily.map((d) => `${d.date}:${d.requests}`)).toEqual(["2026-09-08:1", "2026-09-09:2", "2026-09-10:1", "2026-09-11:1", "2026-09-12:1"]);
    expect(o.byStatus[0]).toEqual({ status: "completed", count: 3 });
    expect(startDelayMin(ROWS[1])).toBe(40);
  });
});

describe("drivers and vehicles", () => {
  it("sums per driver: tasks, punctuality, fuel, ratings, days", () => {
    const d = driverReport(ROWS);
    expect(d.map((x) => x.name)).toEqual(["Bob", "Dee"]);
    const bob = d[0];
    expect([bob.tasks, bob.completed, bob.started, bob.onTime, bob.onTimeRate]).toEqual([4, 3, 3, 2, 67]);
    expect([bob.km, bob.litres, bob.fuelCost, bob.lPer100]).toEqual([80, 8, 6000, 10]);
    expect([bob.ratings, bob.avgRating, bob.daysWorked]).toEqual([3, 4.3, 4]);
    expect(d[1].noShows).toBe(1);
  });

  it("sums per vehicle with the last odometer", () => {
    const v = vehicleReport(ROWS);
    expect(v.map((x) => [x.name, x.tasks, x.km, x.litres, x.lastOdometer])).toEqual([
      ["Hiace", 4, 80, 8, 140],
      ["Prado", 1, 0, 10, null],
    ]);
  });
});

describe("requesters, routes, peaks", () => {
  it("rolls requests up per person and department", () => {
    const r = requesterReport(ROWS);
    expect(r.byPerson.map((p) => [p.name, p.requests, p.cancelled])).toEqual([
      ["Ann", 6, 1],
      ["Cy", 1, 0],
    ]);
    expect(r.byDepartment.map((d) => [d.department, d.requests, d.people])).toEqual([
      ["Ops", 6, 1],
      ["HSE", 1, 1],
    ]);
  });

  it("ranks routes and finds the busy weekday and hour", () => {
    const routes = routeReport(ROWS);
    expect(routes[0]).toMatchObject({ pickup: "Base", dropoff: "Airport", trips: 5, avgKm: 40 });
    expect(routes[1]).toMatchObject({ dropoff: "Port", trips: 1, avgPassengers: 3 });
    const p = peakReport(ROWS);
    expect(p.byHour[8]).toBe(5); // 07:00Z = 08:00 local
    expect(p.busiestHour).toBe(8);
    expect(p.busiestWeekday).toBe(2); // Tuesday
  });
});

describe("shuttles and approvals", () => {
  it("measures occupancy per shuttle from seats", () => {
    const s = shuttleReport([{ id: "s1", name: "Airport run", pickup: "Base", dropoff: "Airport", passengers: 8 }], ROWS, [
      { shuttle_id: "s1", ride_date: "2026-09-11" },
      { shuttle_id: "s1", ride_date: "2026-09-11" },
    ]);
    expect(s).toEqual([{ name: "Airport run", route: "Base → Airport", capacity: 8, runs: 1, completedRuns: 1, seatsBooked: 2, seatsOffered: 8, occupancy: 25, emptyRuns: 0 }]);
  });

  it("times the approvals", () => {
    expect(approvalReport(ROWS)).toEqual({ approved: 1, waiting: 1, avgDecisionHours: 4, maxDecisionHours: 4 });
  });
});
