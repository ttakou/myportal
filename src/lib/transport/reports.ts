/**
 * The transportation reports, computed from one set of request rows for a
 * period. Pure: the server loader fetches, these functions count.
 *
 * Times are read on the tenant's clock (Africa/Douala) so "Tuesday" and
 * "08:00" mean what the desk means by them.
 */

import { localDate, localMinutes } from "./day-plan";
import { distanceKm } from "./trip-log";
import type { Shuttle } from "@/types/transport";

export interface ReportRow {
  id: string;
  status: string;
  task_type: string;
  priority: string;
  created_at: string;
  depart_at: string;
  started_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  approved_at: string | null;
  pickup: string;
  dropoff: string;
  passengers: number;
  requester_name: string | null;
  department: string | null;
  driver_name: string | null;
  vehicle_name: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  fuel_litres: number | null;
  fuel_cost: number | null;
  rating: number | null;
  shuttle_id: string | null;
  shuttle_date: string | null;
  return_of: string | null;
}

const DONE = new Set(["completed", "no_show", "cancelled"]);
const OPEN = new Set(["awaiting_approval", "pending", "assigned", "in_progress", "arrived"]);
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null);

/** Minutes between departure and the driver setting off; negative when early. */
export function startDelayMin(row: Pick<ReportRow, "depart_at" | "started_at">): number | null {
  if (!row.started_at) return null;
  return Math.round((Date.parse(row.started_at) - Date.parse(row.depart_at)) / 60_000);
}

// --- Overview -------------------------------------------------------------------

export interface OverviewReport {
  total: number;
  completed: number;
  cancelled: number;
  noShows: number;
  open: number;
  /** Still pending or assigned past departure, right now. */
  overdue: number;
  completionRate: number | null;
  /** Started within `onTimeMinutes` of departure, over started trips. */
  onTimeRate: number | null;
  avgStartDelayMin: number | null;
  avgRating: number | null;
  ratings: number;
  passengers: number;
  /** Requests that came from a shuttle schedule. */
  shuttleRuns: number;
  returnTrips: number;
  byStatus: { status: string; count: number }[];
  byTaskType: { taskType: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  /** One entry per day of the period, on the site clock. */
  daily: { date: string; requests: number; completed: number; cancelled: number; noShows: number }[];
}

export function overviewReport(rows: ReportRow[], from: string, to: string, opts: { nowIso?: string; onTimeMinutes?: number } = {}): OverviewReport {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const onTime = opts.onTimeMinutes ?? 15;
  const byStatus = new Map<string, number>();
  const byType = new Map<string, number>();
  const byPriority = new Map<string, number>();
  const daily = new Map<string, { requests: number; completed: number; cancelled: number; noShows: number }>();
  for (let d = from; d <= to; d = addDay(d)) daily.set(d, { requests: 0, completed: 0, cancelled: 0, noShows: 0 });

  let completed = 0;
  let cancelled = 0;
  let noShows = 0;
  let open = 0;
  let overdue = 0;
  let started = 0;
  let onTimeN = 0;
  let delaySum = 0;
  let ratings = 0;
  let ratingSum = 0;
  let passengers = 0;
  let shuttleRuns = 0;
  let returnTrips = 0;
  for (const r of rows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    byType.set(r.task_type, (byType.get(r.task_type) ?? 0) + 1);
    byPriority.set(r.priority, (byPriority.get(r.priority) ?? 0) + 1);
    const day = daily.get(localDate(r.depart_at));
    if (day) day.requests += 1;
    if (r.status === "completed") {
      completed += 1;
      if (day) day.completed += 1;
    } else if (r.status === "cancelled") {
      cancelled += 1;
      if (day) day.cancelled += 1;
    } else if (r.status === "no_show") {
      noShows += 1;
      if (day) day.noShows += 1;
    } else if (OPEN.has(r.status)) {
      open += 1;
      if ((r.status === "pending" || r.status === "assigned") && r.depart_at < nowIso) overdue += 1;
    }
    const delay = startDelayMin(r);
    if (delay !== null) {
      started += 1;
      delaySum += delay;
      if (delay <= onTime) onTimeN += 1;
    }
    if (r.rating !== null) {
      ratings += 1;
      ratingSum += r.rating;
    }
    if (r.status !== "cancelled") passengers += r.passengers;
    if (r.shuttle_id) shuttleRuns += 1;
    if (r.return_of) returnTrips += 1;
  }
  const decided = completed + noShows + cancelled;
  return {
    total: rows.length,
    completed,
    cancelled,
    noShows,
    open,
    overdue,
    completionRate: pct(completed, decided),
    onTimeRate: pct(onTimeN, started),
    avgStartDelayMin: started ? Math.round(delaySum / started) : null,
    avgRating: ratings ? r1(ratingSum / ratings) : null,
    ratings,
    passengers,
    shuttleRuns,
    returnTrips,
    byStatus: sortedCounts(byStatus, "status"),
    byTaskType: sortedCounts(byType, "taskType"),
    byPriority: sortedCounts(byPriority, "priority"),
    daily: [...daily.entries()].map(([date, d]) => ({ date, ...d })),
  };
}

function sortedCounts<K extends string>(m: Map<string, number>, key: K): ({ [P in K]: string } & { count: number })[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, count]) => ({ [key]: k, count }) as { [P in K]: string } & { count: number });
}

function addDay(d: string): string {
  return new Date(Date.parse(d + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
}

// --- Drivers ----------------------------------------------------------------------

export interface DriverLine {
  name: string;
  /** Tasks assigned to them that were not cancelled. */
  tasks: number;
  completed: number;
  noShows: number;
  started: number;
  onTime: number;
  onTimeRate: number | null;
  avgStartDelayMin: number | null;
  km: number;
  litres: number;
  fuelCost: number;
  lPer100: number | null;
  ratings: number;
  avgRating: number | null;
  /** Distinct days with at least one task. */
  daysWorked: number;
}

export function driverReport(rows: ReportRow[], onTimeMinutes = 15): DriverLine[] {
  const m = new Map<string, DriverLine & { delaySum: number; ratingSum: number; kmF: number; lK: number; days: Set<string> }>();
  for (const r of rows) {
    if (!r.driver_name || r.status === "cancelled") continue;
    const d =
      m.get(r.driver_name) ??
      { name: r.driver_name, tasks: 0, completed: 0, noShows: 0, started: 0, onTime: 0, onTimeRate: null, avgStartDelayMin: null, km: 0, litres: 0, fuelCost: 0, lPer100: null, ratings: 0, avgRating: null, daysWorked: 0, delaySum: 0, ratingSum: 0, kmF: 0, lK: 0, days: new Set() };
    m.set(r.driver_name, d);
    d.tasks += 1;
    d.days.add(localDate(r.depart_at));
    if (r.status === "completed") d.completed += 1;
    if (r.status === "no_show") d.noShows += 1;
    const delay = startDelayMin(r);
    if (delay !== null) {
      d.started += 1;
      d.delaySum += delay;
      if (delay <= onTimeMinutes) d.onTime += 1;
    }
    const km = distanceKm(r) ?? 0;
    d.km += km;
    d.litres += r.fuel_litres ?? 0;
    d.fuelCost += r.fuel_cost ?? 0;
    if (distanceKm(r) !== null && r.fuel_litres !== null && km > 0) {
      d.kmF += km;
      d.lK += r.fuel_litres;
    }
    if (r.rating !== null) {
      d.ratings += 1;
      d.ratingSum += r.rating;
    }
  }
  return [...m.values()]
    .map(({ delaySum, ratingSum, kmF, lK, days, ...d }) => ({
      ...d,
      litres: r1(d.litres),
      onTimeRate: pct(d.onTime, d.started),
      avgStartDelayMin: d.started ? Math.round(delaySum / d.started) : null,
      lPer100: kmF > 0 ? r1((lK / kmF) * 100) : null,
      avgRating: d.ratings ? r1(ratingSum / d.ratings) : null,
      daysWorked: days.size,
    }))
    .sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name));
}

// --- Vehicles ---------------------------------------------------------------------

export interface VehicleLine {
  name: string;
  tasks: number;
  completed: number;
  km: number;
  litres: number;
  fuelCost: number;
  lPer100: number | null;
  daysUsed: number;
  /** Highest odometer reading logged in the period. */
  lastOdometer: number | null;
}

export function vehicleReport(rows: ReportRow[]): VehicleLine[] {
  const m = new Map<string, VehicleLine & { kmF: number; lK: number; days: Set<string> }>();
  for (const r of rows) {
    if (!r.vehicle_name || r.status === "cancelled") continue;
    const v = m.get(r.vehicle_name) ?? { name: r.vehicle_name, tasks: 0, completed: 0, km: 0, litres: 0, fuelCost: 0, lPer100: null, daysUsed: 0, lastOdometer: null, kmF: 0, lK: 0, days: new Set() };
    m.set(r.vehicle_name, v);
    v.tasks += 1;
    v.days.add(localDate(r.depart_at));
    if (r.status === "completed") v.completed += 1;
    const km = distanceKm(r) ?? 0;
    v.km += km;
    v.litres += r.fuel_litres ?? 0;
    v.fuelCost += r.fuel_cost ?? 0;
    if (distanceKm(r) !== null && r.fuel_litres !== null && km > 0) {
      v.kmF += km;
      v.lK += r.fuel_litres;
    }
    if (r.odometer_end !== null) v.lastOdometer = Math.max(v.lastOdometer ?? 0, r.odometer_end);
  }
  return [...m.values()]
    .map(({ kmF, lK, days, ...v }) => ({ ...v, litres: r1(v.litres), lPer100: kmF > 0 ? r1((lK / kmF) * 100) : null, daysUsed: days.size }))
    .sort((a, b) => b.km - a.km || b.tasks - a.tasks || a.name.localeCompare(b.name));
}

// --- Requesters -------------------------------------------------------------------

export interface RequesterLine {
  name: string;
  department: string | null;
  requests: number;
  completed: number;
  cancelled: number;
  noShows: number;
  passengers: number;
}

export interface DepartmentLine {
  department: string;
  requests: number;
  completed: number;
  cancelled: number;
  noShows: number;
  passengers: number;
  people: number;
}

export function requesterReport(rows: ReportRow[]): { byPerson: RequesterLine[]; byDepartment: DepartmentLine[] } {
  const people = new Map<string, RequesterLine>();
  const depts = new Map<string, DepartmentLine & { names: Set<string> }>();
  for (const r of rows) {
    if (!r.requester_name) continue;
    const p = people.get(r.requester_name) ?? { name: r.requester_name, department: r.department, requests: 0, completed: 0, cancelled: 0, noShows: 0, passengers: 0 };
    people.set(r.requester_name, p);
    const dName = r.department ?? "Unassigned";
    const d = depts.get(dName) ?? { department: dName, requests: 0, completed: 0, cancelled: 0, noShows: 0, passengers: 0, people: 0, names: new Set() };
    depts.set(dName, d);
    for (const x of [p, d]) {
      x.requests += 1;
      if (r.status === "completed") x.completed += 1;
      if (r.status === "cancelled") x.cancelled += 1;
      if (r.status === "no_show") x.noShows += 1;
      if (r.status !== "cancelled") x.passengers += r.passengers;
    }
    d.names.add(r.requester_name);
  }
  return {
    byPerson: [...people.values()].sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name)),
    byDepartment: [...depts.values()].map(({ names, ...d }) => ({ ...d, people: names.size })).sort((a, b) => b.requests - a.requests || a.department.localeCompare(b.department)),
  };
}

// --- Routes -----------------------------------------------------------------------

export interface RouteLine {
  pickup: string;
  dropoff: string;
  trips: number;
  completed: number;
  passengers: number;
  avgPassengers: number;
  /** The task type that occurs most on this route. */
  mainType: string;
  avgKm: number | null;
}

export function routeReport(rows: ReportRow[]): RouteLine[] {
  const m = new Map<string, RouteLine & { types: Map<string, number>; kmSum: number; kmN: number }>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    const key = `${r.pickup}|${r.dropoff}`;
    const l = m.get(key) ?? { pickup: r.pickup, dropoff: r.dropoff, trips: 0, completed: 0, passengers: 0, avgPassengers: 0, mainType: r.task_type, avgKm: null, types: new Map(), kmSum: 0, kmN: 0 };
    m.set(key, l);
    l.trips += 1;
    if (r.status === "completed") l.completed += 1;
    l.passengers += r.passengers;
    l.types.set(r.task_type, (l.types.get(r.task_type) ?? 0) + 1);
    const km = distanceKm(r);
    if (km !== null && km > 0) {
      l.kmSum += km;
      l.kmN += 1;
    }
  }
  return [...m.values()]
    .map(({ types, kmSum, kmN, ...l }) => ({
      ...l,
      avgPassengers: r1(l.passengers / l.trips),
      mainType: [...types.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? l.mainType,
      avgKm: kmN ? r1(kmSum / kmN) : null,
    }))
    .sort((a, b) => b.trips - a.trips || a.pickup.localeCompare(b.pickup));
}

// --- Peaks ------------------------------------------------------------------------

export interface PeakReport {
  /** Sunday first, on the site clock. */
  byWeekday: number[];
  byHour: number[];
  busiestWeekday: number | null;
  busiestHour: number | null;
}

export function peakReport(rows: ReportRow[]): PeakReport {
  const byWeekday = Array(7).fill(0) as number[];
  const byHour = Array(24).fill(0) as number[];
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    byWeekday[new Date(localDate(r.depart_at) + "T00:00:00Z").getUTCDay()] += 1;
    byHour[Math.floor(localMinutes(r.depart_at) / 60)] += 1;
  }
  const maxIdx = (a: number[]) => (a.some((n) => n > 0) ? a.indexOf(Math.max(...a)) : null);
  return { byWeekday, byHour, busiestWeekday: maxIdx(byWeekday), busiestHour: maxIdx(byHour) };
}

// --- Shuttles ---------------------------------------------------------------------

export interface SeatLite {
  shuttle_id: string;
  ride_date: string;
}

export interface ShuttleLine {
  name: string;
  route: string;
  capacity: number;
  runs: number;
  completedRuns: number;
  seatsBooked: number;
  seatsOffered: number;
  occupancy: number | null;
  /** Runs that went out with nobody booked. */
  emptyRuns: number;
}

export function shuttleReport(shuttles: Pick<Shuttle, "id" | "name" | "pickup" | "dropoff" | "passengers">[], rows: ReportRow[], seats: SeatLite[]): ShuttleLine[] {
  const seatsByRun = new Map<string, number>();
  for (const s of seats) {
    const k = `${s.shuttle_id}|${s.ride_date}`;
    seatsByRun.set(k, (seatsByRun.get(k) ?? 0) + 1);
  }
  return shuttles
    .map((s) => {
      const runs = rows.filter((r) => r.shuttle_id === s.id && r.status !== "cancelled");
      let booked = 0;
      let empty = 0;
      for (const r of runs) {
        const n = seatsByRun.get(`${s.id}|${r.shuttle_date ?? localDate(r.depart_at)}`) ?? 0;
        booked += n;
        if (n === 0) empty += 1;
      }
      const offered = runs.length * s.passengers;
      return {
        name: s.name,
        route: `${s.pickup} → ${s.dropoff}`,
        capacity: s.passengers,
        runs: runs.length,
        completedRuns: runs.filter((r) => r.status === "completed").length,
        seatsBooked: booked,
        seatsOffered: offered,
        occupancy: pct(booked, offered),
        emptyRuns: empty,
      };
    })
    .filter((l) => l.runs > 0)
    .sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
}

// --- Approvals --------------------------------------------------------------------

export interface ApprovalReport {
  /** Requests that went through approval (approved_at set). */
  approved: number;
  /** Still waiting right now. */
  waiting: number;
  avgDecisionHours: number | null;
  /** Longest wait among approved ones, in hours. */
  maxDecisionHours: number | null;
}

export function approvalReport(rows: ReportRow[]): ApprovalReport {
  let approved = 0;
  let waiting = 0;
  let sum = 0;
  let max = 0;
  for (const r of rows) {
    if (r.status === "awaiting_approval") waiting += 1;
    if (r.approved_at) {
      approved += 1;
      const h = (Date.parse(r.approved_at) - Date.parse(r.created_at)) / 3_600_000;
      sum += h;
      max = Math.max(max, h);
    }
  }
  return { approved, waiting, avgDecisionHours: approved ? r1(sum / approved) : null, maxDecisionHours: approved ? r1(max) : null };
}

export { DONE as TERMINAL_STATUSES };
