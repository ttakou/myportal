/**
 * The daily assignments monitoring sheet, rebuilt from data.
 *
 * One month at a time: a row per working day, grouped by week as on the
 * desk's workbook ("Week 1" is the first, possibly partial, week), a column
 * per driver in the desk's order, the day's total on the right and each
 * driver's total at the bottom.
 *
 * A day the desk has recorded (or that came from the 2026 workbook) shows
 * those counts. Any other past day counts the tasks dispatched to drivers
 * in the portal. Days still to come stay blank.
 *
 * Pure: no database or clock access, so the page, the panel and the tests
 * share it.
 */

import { localDate } from "@/lib/transport/day-plan";

/** Where a recorded count came from: the 2026 workbook, or the desk's tally in the portal. */
export type AssignmentSource = "import" | "tally";

/** Where a day's counts come from. */
export type DaySource = AssignmentSource | "portal" | "none" | "upcoming";

export const DAY_SOURCE_LABEL: Record<DaySource, string> = {
  import: "Sheet",
  tally: "Recorded",
  portal: "Portal tasks",
  none: "Not recorded",
  upcoming: "",
};

/** Task statuses that count as an assignment: a driver was sent. */
export const COUNTED_STATUSES = ["assigned", "in_progress", "arrived", "completed", "no_show"] as const;

/** Highest count one driver can be given for one day. */
export const MAX_DAILY_ASSIGNMENTS = 99;

export interface RecordedRow {
  day: string;
  driver_id: string;
  assignments: number;
  source: AssignmentSource;
}

export interface LiveTask {
  depart_at: string;
  driver_id: string | null;
  status: string;
}

export interface SheetDriver {
  id: string;
  name: string;
  active: boolean;
  sort_order: number | null;
}

export interface GridDay {
  /** YYYY-MM-DD, site clock. */
  date: string;
  week: number;
  /** "Mon".."Sun". */
  weekday: string;
  /** First shown day of its week: where the "Week N" label goes. */
  firstOfWeek: boolean;
  /** How many days the week has in the grid, for the label's row span. */
  weekSpan: number;
  source: DaySource;
  /** Driver id → assignments. Missing means none. */
  counts: Record<string, number>;
  total: number;
}

export interface AssignmentGrid {
  /** YYYY-MM. */
  month: string;
  /** "September 2026". */
  label: string;
  drivers: (SheetDriver & { total: number })[];
  days: GridDay[];
  total: number;
  /** Days whose counts come from the sheet or the desk's tally. */
  recordedDays: number;
  /** Past working days with neither a tally nor a portal task. */
  missingDays: number;
  /** Days with at least one assignment. */
  workedDays: number;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function isMonth(v: string | null | undefined): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function isDay(v: string | null | undefined): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
}

/** "2026-09" moved by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** "September 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAME[m - 1]} ${y}`;
}

/** First and last calendar day of a month. */
export function monthBounds(month: string): { first: string; last: string } {
  const first = `${month}-01`;
  const last = new Date(Date.parse(shiftMonth(month, 1) + "-01T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
  return { first, last };
}

function dayOfWeek(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

/** The Monday of the week a date falls in, so Saturday and Sunday join the week before. */
function weekStart(date: string): string {
  const dow = dayOfWeek(date);
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(Date.parse(date + "T00:00:00Z") - back * 86_400_000).toISOString().slice(0, 10);
}

function monthDates(month: string): string[] {
  const { first, last } = monthBounds(month);
  const out: string[] = [];
  for (let t = Date.parse(first + "T00:00:00Z"); t <= Date.parse(last + "T00:00:00Z"); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Tasks per site-clock day and driver, counting only statuses where a driver was sent. */
export function liveCounts(tasks: LiveTask[]): Map<string, Map<string, number>> {
  const counted = new Set<string>(COUNTED_STATUSES);
  const out = new Map<string, Map<string, number>>();
  for (const t of tasks) {
    if (!t.driver_id || !counted.has(t.status)) continue;
    const day = localDate(t.depart_at);
    const byDriver = out.get(day) ?? new Map<string, number>();
    byDriver.set(t.driver_id, (byDriver.get(t.driver_id) ?? 0) + 1);
    out.set(day, byDriver);
  }
  return out;
}

/** Desk order first (the sheet's columns), then by name. */
export function sheetOrder<T extends { name: string; sort_order: number | null }>(drivers: T[]): T[] {
  return [...drivers].sort((a, b) => {
    const oa = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const ob = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    return oa - ob || a.name.localeCompare(b.name);
  });
}

/**
 * Build one month's sheet.
 *
 * Columns: every driver with a recorded row or a portal task in the month;
 * plus the active drivers when the month has no recorded row yet or is the
 * current month or later, so a new month opens with today's roster.
 */
export function buildAssignmentGrid(input: {
  month: string;
  /** Today on the site clock, YYYY-MM-DD. */
  today: string;
  drivers: SheetDriver[];
  recorded: RecordedRow[];
  tasks: LiveTask[];
}): AssignmentGrid {
  const { month, today } = input;
  const { first, last } = monthBounds(month);
  const inMonth = (d: string) => d >= first && d <= last;

  const recordedByDay = new Map<string, RecordedRow[]>();
  for (const r of input.recorded) {
    if (!inMonth(r.day)) continue;
    const list = recordedByDay.get(r.day) ?? [];
    list.push(r);
    recordedByDay.set(r.day, list);
  }
  const live = liveCounts(input.tasks);

  // Roster.
  const onSheet = new Set<string>();
  for (const rows of recordedByDay.values()) for (const r of rows) onSheet.add(r.driver_id);
  for (const [day, byDriver] of live) if (inMonth(day)) for (const id of byDriver.keys()) onSheet.add(id);
  const openMonth = recordedByDay.size === 0 || month >= today.slice(0, 7);
  const roster = sheetOrder(input.drivers.filter((d) => onSheet.has(d.id) || (openMonth && d.active)));
  const rosterIds = new Set(roster.map((d) => d.id));

  // Days: every weekday, and a weekend day only when something happened on it.
  const dates = monthDates(month).filter((d) => {
    const dow = dayOfWeek(d);
    if (dow >= 1 && dow <= 5) return true;
    return recordedByDay.get(d)?.some((r) => r.assignments > 0) || (live.get(d)?.size ?? 0) > 0;
  });

  let week = 0;
  let lastWeekStart = "";
  const days: GridDay[] = dates.map((date) => {
    const ws = weekStart(date);
    const firstOfWeek = ws !== lastWeekStart;
    if (firstOfWeek) {
      week += 1;
      lastWeekStart = ws;
    }
    const rows = recordedByDay.get(date);
    let source: DaySource;
    const counts: Record<string, number> = {};
    if (rows) {
      source = rows.some((r) => r.source === "tally") ? "tally" : "import";
      for (const r of rows) if (r.assignments > 0 && rosterIds.has(r.driver_id)) counts[r.driver_id] = r.assignments;
    } else if (date > today) {
      source = "upcoming";
    } else {
      const byDriver = live.get(date);
      source = byDriver && byDriver.size > 0 ? "portal" : "none";
      if (byDriver) for (const [id, n] of byDriver) if (rosterIds.has(id)) counts[id] = n;
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return { date, week, weekday: WEEKDAY[dayOfWeek(date)], firstOfWeek, weekSpan: 0, source, counts, total };
  });
  for (const d of days) if (d.firstOfWeek) d.weekSpan = days.filter((x) => x.week === d.week).length;

  const driverTotals = new Map<string, number>();
  for (const d of days) for (const [id, n] of Object.entries(d.counts)) driverTotals.set(id, (driverTotals.get(id) ?? 0) + n);

  return {
    month,
    label: monthLabel(month),
    drivers: roster.map((d) => ({ ...d, total: driverTotals.get(d.id) ?? 0 })),
    days,
    total: days.reduce((s, d) => s + d.total, 0),
    recordedDays: days.filter((d) => d.source === "import" || d.source === "tally").length,
    missingDays: days.filter((d) => d.source === "none" && dayOfWeek(d.date) >= 1 && dayOfWeek(d.date) <= 5).length,
    workedDays: days.filter((d) => d.total > 0).length,
  };
}

/** "Thu 01/01" as the sheet labels a day, with the date added. */
export function dayLabel(d: Pick<GridDay, "weekday" | "date">): string {
  return `${d.weekday} ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`;
}

/**
 * The month as a table in the workbook's layout, for the CSV download:
 * a title row, a header row, one row per day (zeros left blank, as on the
 * sheet) and the totals row.
 */
export function gridTable(grid: AssignmentGrid): string[][] {
  const head = ["Week", "Day", "Date", ...grid.drivers.map((d) => d.name), "Total"];
  const rows = grid.days.map((d) => [
    d.firstOfWeek ? `Week ${d.week}` : "",
    d.weekday,
    d.date,
    ...grid.drivers.map((dr) => (d.counts[dr.id] ? String(d.counts[dr.id]) : "")),
    d.source === "upcoming" ? "" : String(d.total),
  ]);
  const totals = ["Total", "", "", ...grid.drivers.map((d) => String(d.total)), String(grid.total)];
  return [[`Daily Assignments Monitoring — ${grid.label}`], head, ...rows, totals];
}

/** Why a tally cannot be saved, or null when it can. */
export function tallyError(day: string, today: string, counts: { driverId: string; n: number }[]): string | null {
  if (!isDay(day)) return "Pick a date.";
  if (day > today) return "A day still to come cannot be recorded yet.";
  if (counts.length === 0) return "No driver to record.";
  const seen = new Set<string>();
  for (const c of counts) {
    if (!c.driverId) return "A driver is missing.";
    if (seen.has(c.driverId)) return "A driver appears twice.";
    seen.add(c.driverId);
    if (!Number.isInteger(c.n) || c.n < 0 || c.n > MAX_DAILY_ASSIGNMENTS) {
      return `Assignments must be a whole number from 0 to ${MAX_DAILY_ASSIGNMENTS}.`;
    }
  }
  return null;
}
