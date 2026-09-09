import { describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso } from "@/lib/transport/day-plan";
import { dueReminders, isLateStart, lateStarts, minutesLate } from "@/lib/transport/live";
import { describeTripLog, distanceKm, summariseTrips, validateTripLog } from "@/lib/transport/trip-log";

describe("tenant-clock input", () => {
  it("reads a datetime-local value on the Douala clock, whatever the browser", () => {
    expect(localInputToIso("2026-09-10T08:00")).toBe("2026-09-10T07:00:00.000Z");
    expect(localInputToIso("2026-09-10T00:30:15")).toBe("2026-09-09T23:30:15.000Z");
    expect(localInputToIso("not a date")).toBeNull();
    expect(localInputToIso("")).toBeNull();
  });

  it("round-trips back to the input value", () => {
    expect(isoToLocalInput("2026-09-10T07:00:00.000Z")).toBe("2026-09-10T08:00");
    expect(localInputToIso(isoToLocalInput("2026-09-10T12:34:00.000Z"))).toBe("2026-09-10T12:34:00.000Z");
  });
});

describe("trip log", () => {
  it("accepts blanks and numbers, rejects negatives and text", () => {
    expect(validateTripLog({})).toEqual({ ok: true, log: { odometer_start: null, odometer_end: null, fuel_litres: null, fuel_cost: null } });
    const ok = validateTripLog({ odometerStart: "1200", odometerEnd: 1242, fuelLitres: "6,5", fuelCost: "5200" });
    expect(ok).toEqual({ ok: true, log: { odometer_start: 1200, odometer_end: 1242, fuel_litres: 6.5, fuel_cost: 5200 } });
    expect(validateTripLog({ fuelLitres: "-1" })).toMatchObject({ ok: false });
    expect(validateTripLog({ odometerEnd: "abc" })).toMatchObject({ ok: false });
  });

  it("refuses an end reading below the start", () => {
    expect(validateTripLog({ odometerStart: 100, odometerEnd: 90 })).toMatchObject({ ok: false, error: expect.stringContaining("below") });
  });

  it("describes what was logged", () => {
    expect(distanceKm({ odometer_start: 1200, odometer_end: 1242 })).toBe(42);
    expect(distanceKm({ odometer_start: null, odometer_end: 1242 })).toBeNull();
    expect(describeTripLog({ odometer_start: 1200, odometer_end: 1242, fuel_litres: 6.5, fuel_cost: 5200 })).toBe("42 km · 6.5 L · fuel 5,200");
    expect(describeTripLog({ odometer_start: null, odometer_end: null, fuel_litres: null, fuel_cost: null })).toBeNull();
  });

  it("sums kilometres, fuel, no-shows and ratings per driver and vehicle", () => {
    const s = summariseTrips([
      { status: "completed", driver_name: "Ann", vehicle_name: "Hiace", log: { odometer_start: 0, odometer_end: 100, fuel_litres: 10, fuel_cost: 7000 }, rating: 5 },
      { status: "completed", driver_name: "Ann", vehicle_name: "Hiace", log: { odometer_start: 100, odometer_end: 150, fuel_litres: null, fuel_cost: null }, rating: 3 },
      { status: "no_show", driver_name: "Ann", vehicle_name: null, log: { odometer_start: null, odometer_end: null, fuel_litres: null, fuel_cost: null }, rating: null },
      { status: "completed", driver_name: "Bob", vehicle_name: "Prado", log: { odometer_start: null, odometer_end: null, fuel_litres: 20, fuel_cost: 14000 }, rating: null },
      { status: "cancelled", driver_name: "Bob", vehicle_name: "Prado", log: { odometer_start: 0, odometer_end: 999, fuel_litres: 1, fuel_cost: 1 }, rating: null },
    ]);
    expect(s.trips).toBe(3);
    expect(s.km).toBe(150);
    expect(s.litres).toBe(30);
    expect(s.fuelCost).toBe(21000);
    expect(s.noShows).toBe(1);
    expect(s.avgRating).toBe(4);
    expect(s.byDriver.map((d) => [d.name, d.trips, d.noShows, d.km, d.lPer100, d.avgRating])).toEqual([
      ["Ann", 2, 1, 150, 10, 4],
      ["Bob", 1, 0, 0, null, null],
    ]);
    expect(s.byVehicle.map((v) => [v.name, v.trips, v.km, v.litres])).toEqual([
      ["Hiace", 2, 150, 10],
      ["Prado", 1, 0, 20],
    ]);
  });
});

describe("live job", () => {
  const now = "2026-09-10T07:00:00Z";
  const task = (id: string, over: Partial<Parameters<typeof dueReminders>[0][number]> = {}) => ({
    id,
    status: "assigned",
    depart_at: "2026-09-10T07:20:00Z",
    driver_id: "d",
    reminded_at: null,
    late_alerted_at: null,
    ...over,
  });

  it("reminds assigned tasks departing inside the window, once", () => {
    const tasks = [
      task("soon"),
      task("later", { depart_at: "2026-09-10T08:00:00Z" }),
      task("done", { reminded_at: now }),
      task("nobody", { driver_id: null }),
      task("gone", { depart_at: "2026-09-10T06:59:00Z" }),
    ];
    expect(dueReminders(tasks, now, 30).map((t) => t.id)).toEqual(["soon"]);
    expect(dueReminders(tasks, now, 0)).toEqual([]);
  });

  it("alerts tasks past departure with nobody on the way, once", () => {
    const tasks = [
      task("late", { depart_at: "2026-09-10T06:40:00Z" }),
      task("nodriver", { depart_at: "2026-09-10T06:00:00Z", status: "pending", driver_id: null }),
      task("justnow", { depart_at: "2026-09-10T06:50:00Z" }),
      task("rolling", { depart_at: "2026-09-10T06:00:00Z", status: "in_progress" }),
      task("told", { depart_at: "2026-09-10T06:00:00Z", late_alerted_at: now }),
    ];
    expect(lateStarts(tasks, now, 15).map((t) => t.id)).toEqual(["late", "nodriver"]);
    expect(lateStarts(tasks, now, 0)).toEqual([]);
    expect(minutesLate("2026-09-10T06:40:00Z", now)).toBe(20);
    expect(isLateStart({ status: "assigned", depart_at: "2026-09-10T06:40:00Z" }, now, 15)).toBe(true);
    expect(isLateStart({ status: "arrived", depart_at: "2026-09-10T06:40:00Z" }, now, 15)).toBe(false);
  });
});
