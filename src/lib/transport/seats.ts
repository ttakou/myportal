/**
 * Seats on a shuttle run. A run is a shuttle on a date; its capacity is
 * the shuttle's passenger count; a seat is one person on one run. Pure.
 */

import type { Shuttle } from "@/types/transport";
import { localDate, shiftDate } from "./day-plan";
import { shuttleDepartAt, shuttleRunsOn } from "./shuttles";

export interface ShuttleRun {
  shuttle: Shuttle;
  /** YYYY-MM-DD on the tenant's clock. */
  date: string;
  /** UTC instant of departure. */
  departAt: string;
}

/** The key a manifest is filed under. */
export function runKey(shuttleId: string, date: string): string {
  return `${shuttleId}|${date}`;
}

/** How far ahead a seat can be booked. */
export const BOOKING_DAYS_AHEAD = 14;

/**
 * The runs still to depart from now over the next `days` days, soonest
 * first. Today's runs that already left are not offered.
 */
export function upcomingRuns(shuttles: Shuttle[], nowIso: string, days = BOOKING_DAYS_AHEAD): ShuttleRun[] {
  const today = localDate(nowIso);
  const runs: ShuttleRun[] = [];
  for (let i = 0; i < days; i++) {
    const date = shiftDate(today, i);
    for (const s of shuttles) {
      if (!shuttleRunsOn(s, date)) continue;
      const departAt = shuttleDepartAt(s, date);
      if (Date.parse(departAt) <= Date.parse(nowIso)) continue;
      runs.push({ shuttle: s, date, departAt });
    }
  }
  return runs.sort((a, b) => a.departAt.localeCompare(b.departAt));
}

/** Seats still free on a run; never below zero. */
export function seatsLeft(capacity: number, booked: number): number {
  return Math.max(0, capacity - booked);
}

/** Whether a seat can still be taken: the run is ahead and not full. */
export function canBook(run: Pick<ShuttleRun, "departAt" | "shuttle">, booked: number, nowIso: string): boolean {
  return Date.parse(run.departAt) > Date.parse(nowIso) && seatsLeft(run.shuttle.passengers, booked) > 0;
}

/** Group upcoming runs by date for the booking page. */
export function runsByDate(runs: ShuttleRun[]): { date: string; runs: ShuttleRun[] }[] {
  const map = new Map<string, ShuttleRun[]>();
  for (const r of runs) map.set(r.date, [...(map.get(r.date) ?? []), r]);
  return [...map.entries()].map(([date, list]) => ({ date, runs: list }));
}
