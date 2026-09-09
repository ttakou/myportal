/**
 * A dispatcher's day: one lane per driver, tasks placed on a clock, clashes
 * called out, the unassigned in a pile to the side. Pure.
 *
 * The tenant runs on Africa/Douala time, one hour ahead of UTC with no
 * daylight saving, so a "day" is that clock's day and a task's position on
 * the timeline is its local hour.
 */

import type { Driver, TransportRequest } from "@/types/transport";

/** The tenant's clock, hours ahead of UTC. */
export const TENANT_UTC_OFFSET_HOURS = 1;

/** The UTC instants that bound one local day. */
export function dayRangeIso(dateIso: string, offsetHours = TENANT_UTC_OFFSET_HOURS): { from: string; to: string } {
  const start = Date.parse(dateIso + "T00:00:00Z") - offsetHours * 3_600_000;
  return { from: new Date(start).toISOString(), to: new Date(start + 86_400_000).toISOString() };
}

/** The local date (YYYY-MM-DD) an instant falls on. */
export function localDate(iso: string, offsetHours = TENANT_UTC_OFFSET_HOURS): string {
  return new Date(Date.parse(iso) + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** "07:30" on the tenant's clock. */
export function localTime(iso: string, offsetHours = TENANT_UTC_OFFSET_HOURS): string {
  return new Date(Date.parse(iso) + offsetHours * 3_600_000).toISOString().slice(11, 16);
}

/**
 * A `datetime-local` value ("2026-09-10T08:00") read on the tenant's clock,
 * whatever the browser's or the server's zone, as a UTC instant. Returns
 * null for anything that is not a date-time.
 */
export function localInputToIso(value: string, offsetHours = TENANT_UTC_OFFSET_HOURS): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const base = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}Z`);
  if (Number.isNaN(base)) return null;
  return new Date(base - offsetHours * 3_600_000).toISOString();
}

/** The reverse: a UTC instant as a `datetime-local` value on the tenant's clock. */
export function isoToLocalInput(iso: string, offsetHours = TENANT_UTC_OFFSET_HOURS): string {
  return new Date(Date.parse(iso) + offsetHours * 3_600_000).toISOString().slice(0, 16);
}

/** Minutes past local midnight. */
export function localMinutes(iso: string, offsetHours = TENANT_UTC_OFFSET_HOURS): number {
  const d = new Date(Date.parse(iso) + offsetHours * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** The timeline the planner draws, in local hours. */
export const PLANNER_START_HOUR = 5;
export const PLANNER_END_HOUR = 22;

/** Where a task sits on the timeline, 0..100 percent; clamped to the drawn hours. */
export function timelinePct(iso: string): number {
  const m = localMinutes(iso);
  const start = PLANNER_START_HOUR * 60;
  const span = (PLANNER_END_HOUR - PLANNER_START_HOUR) * 60;
  return Math.max(0, Math.min(100, ((m - start) / span) * 100));
}

/** Tasks in flight or still to run; done and cancelled do not clash with anything. */
const LIVE = new Set(["awaiting_approval", "pending", "assigned", "in_progress", "arrived"]);

export interface Lane {
  driver: Driver;
  tasks: TransportRequest[];
  /** Task ids that sit within `clashMinutes` of another task in this lane. */
  clashing: Set<string>;
}

export interface DayPlan {
  lanes: Lane[];
  /** Live tasks with no driver yet, soonest first. */
  unassigned: TransportRequest[];
  /** Tasks whose driver is not in the lanes (retired or off the list). */
  orphaned: TransportRequest[];
  /** Live tasks in the day, all drivers. */
  liveCount: number;
}

export function planDay(
  requests: TransportRequest[],
  drivers: Driver[],
  clashMinutes = 60,
): DayPlan {
  const byDriver = new Map<string, TransportRequest[]>();
  const unassigned: TransportRequest[] = [];
  const orphaned: TransportRequest[] = [];
  const known = new Set(drivers.map((d) => d.id));
  let liveCount = 0;
  const sorted = [...requests].sort((a, b) => a.depart_at.localeCompare(b.depart_at));
  for (const r of sorted) {
    const live = LIVE.has(r.status);
    if (live) liveCount += 1;
    if (!r.driver_id) {
      if (live) unassigned.push(r);
      continue;
    }
    if (!known.has(r.driver_id)) {
      orphaned.push(r);
      continue;
    }
    byDriver.set(r.driver_id, [...(byDriver.get(r.driver_id) ?? []), r]);
  }
  const lanes: Lane[] = [...drivers]
    .sort((a, b) => Number(b.on_duty) - Number(a.on_duty) || a.full_name.localeCompare(b.full_name))
    .map((driver) => {
      const tasks = byDriver.get(driver.id) ?? [];
      const clashing = new Set<string>();
      const live = tasks.filter((t) => LIVE.has(t.status));
      for (let i = 1; i < live.length; i++) {
        const gap = (Date.parse(live[i].depart_at) - Date.parse(live[i - 1].depart_at)) / 60_000;
        if (gap < clashMinutes) {
          clashing.add(live[i - 1].id);
          clashing.add(live[i].id);
        }
      }
      return { driver, tasks, clashing };
    });
  return { lanes, unassigned, orphaned, liveCount };
}

/** Yesterday / tomorrow for the date links. */
export function shiftDate(dateIso: string, days: number): string {
  return new Date(Date.parse(dateIso + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}
