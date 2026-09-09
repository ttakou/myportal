/**
 * The driver's trip log and what the cost report makes of it. Pure.
 *
 * A driver notes the odometer at start and end and the fuel taken; the
 * report sums kilometres, litres and cost per driver and per vehicle, and
 * folds in the requester's rating as the quality signal.
 */

import type { TripLog } from "@/types/transport";

export interface TripLogInput {
  odometerStart?: number | string | null;
  odometerEnd?: number | string | null;
  fuelLitres?: number | string | null;
  fuelCost?: number | string | null;
}

/** A numeric field: blank means not logged; anything else must be a non-negative number. */
function num(v: number | string | null | undefined, label: string): { value: number | null; error?: string } {
  if (v === null || v === undefined || v === "") return { value: null };
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return { value: null, error: `${label} must be a number, zero or more.` };
  return { value: n };
}

/** Validate what the driver typed; returns the clean log or the first error. */
export function validateTripLog(input: TripLogInput): { ok: true; log: TripLog } | { ok: false; error: string } {
  const start = num(input.odometerStart, "Odometer at start");
  if (start.error) return { ok: false, error: start.error };
  const end = num(input.odometerEnd, "Odometer at end");
  if (end.error) return { ok: false, error: end.error };
  const litres = num(input.fuelLitres, "Fuel (litres)");
  if (litres.error) return { ok: false, error: litres.error };
  const cost = num(input.fuelCost, "Fuel cost");
  if (cost.error) return { ok: false, error: cost.error };
  if (start.value !== null && end.value !== null && end.value < start.value) {
    return { ok: false, error: "Odometer at end cannot be below the start reading." };
  }
  return {
    ok: true,
    log: {
      odometer_start: start.value === null ? null : Math.round(start.value),
      odometer_end: end.value === null ? null : Math.round(end.value),
      fuel_litres: litres.value,
      fuel_cost: cost.value,
    },
  };
}

/** Kilometres driven, when both readings exist. */
export function distanceKm(log: Pick<TripLog, "odometer_start" | "odometer_end">): number | null {
  if (log.odometer_start === null || log.odometer_end === null) return null;
  return Math.max(0, log.odometer_end - log.odometer_start);
}

/** "42 km · 6.5 L · 5 200": the log in one line, or null when nothing was logged. */
export function describeTripLog(log: TripLog): string | null {
  const parts: string[] = [];
  const km = distanceKm(log);
  if (km !== null) parts.push(`${km} km`);
  if (log.fuel_litres !== null) parts.push(`${log.fuel_litres} L`);
  if (log.fuel_cost !== null) parts.push(`fuel ${log.fuel_cost.toLocaleString("en-GB")}`);
  return parts.length ? parts.join(" · ") : null;
}

export interface TripRow {
  status: string;
  driver_name: string | null;
  vehicle_name: string | null;
  log: TripLog;
  rating: number | null;
}

export interface CostLine {
  name: string;
  trips: number;
  km: number;
  litres: number;
  fuelCost: number;
  /** Litres per 100 km, when both are known. */
  lPer100: number | null;
}

export interface DriverLine extends CostLine {
  noShows: number;
  ratings: number;
  avgRating: number | null;
}

export interface TripSummary {
  trips: number;
  km: number;
  litres: number;
  fuelCost: number;
  noShows: number;
  ratings: number;
  avgRating: number | null;
  byDriver: DriverLine[];
  byVehicle: CostLine[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Totals from completed trips (and no-shows), per driver and per vehicle. */
export function summariseTrips(rows: TripRow[]): TripSummary {
  const drivers = new Map<string, DriverLine & { kmWithFuel: number; litresWithKm: number; ratingSum: number }>();
  const vehicles = new Map<string, CostLine & { kmWithFuel: number; litresWithKm: number }>();
  let trips = 0;
  let km = 0;
  let litres = 0;
  let fuelCost = 0;
  let noShows = 0;
  let ratings = 0;
  let ratingSum = 0;
  let kmWithFuel = 0;
  let litresWithKm = 0;

  for (const r of rows) {
    const dName = r.driver_name ?? "Unassigned";
    const d =
      drivers.get(dName) ??
      { name: dName, trips: 0, km: 0, litres: 0, fuelCost: 0, lPer100: null, noShows: 0, ratings: 0, avgRating: null, kmWithFuel: 0, litresWithKm: 0, ratingSum: 0 };
    drivers.set(dName, d);
    if (r.status === "no_show") {
      noShows += 1;
      d.noShows += 1;
      continue;
    }
    if (r.status !== "completed") continue;
    trips += 1;
    d.trips += 1;
    const dist = distanceKm(r.log) ?? 0;
    const l = r.log.fuel_litres ?? 0;
    const c = r.log.fuel_cost ?? 0;
    km += dist;
    litres += l;
    fuelCost += c;
    d.km += dist;
    d.litres += l;
    d.fuelCost += c;
    if (distanceKm(r.log) !== null && r.log.fuel_litres !== null && dist > 0) {
      kmWithFuel += dist;
      litresWithKm += l;
      d.kmWithFuel += dist;
      d.litresWithKm += l;
    }
    if (r.rating !== null) {
      ratings += 1;
      ratingSum += r.rating;
      d.ratings += 1;
      d.ratingSum += r.rating;
    }
    if (r.vehicle_name) {
      const v = vehicles.get(r.vehicle_name) ?? { name: r.vehicle_name, trips: 0, km: 0, litres: 0, fuelCost: 0, lPer100: null, kmWithFuel: 0, litresWithKm: 0 };
      vehicles.set(r.vehicle_name, v);
      v.trips += 1;
      v.km += dist;
      v.litres += l;
      v.fuelCost += c;
      if (distanceKm(r.log) !== null && r.log.fuel_litres !== null && dist > 0) {
        v.kmWithFuel += dist;
        v.litresWithKm += l;
      }
    }
  }

  const lPer100 = (kmF: number, lK: number) => (kmF > 0 ? round1((lK / kmF) * 100) : null);
  const byDriver: DriverLine[] = [...drivers.values()]
    .filter((d) => d.trips > 0 || d.noShows > 0)
    .map(({ kmWithFuel: kf, litresWithKm: lk, ratingSum: rs, ...d }) => ({
      ...d,
      litres: round1(d.litres),
      lPer100: lPer100(kf, lk),
      avgRating: d.ratings > 0 ? round1(rs / d.ratings) : null,
    }))
    .sort((a, b) => b.trips - a.trips || a.name.localeCompare(b.name));
  const byVehicle: CostLine[] = [...vehicles.values()]
    .map(({ kmWithFuel: kf, litresWithKm: lk, ...v }) => ({ ...v, litres: round1(v.litres), lPer100: lPer100(kf, lk) }))
    .sort((a, b) => b.km - a.km || a.name.localeCompare(b.name));

  return {
    trips,
    km,
    litres: round1(litres),
    fuelCost,
    noShows,
    ratings,
    avgRating: ratings > 0 ? round1(ratingSum / ratings) : null,
    byDriver,
    byVehicle,
  };
}
