/**
 * Team attendance, read for a line manager: what each person below them did
 * each day, and what that adds up to over a period.
 *
 * A day without a check-in is not automatically an absence. Rotational
 * offshore staff are not expected at the base on either half of their
 * rotation, and which half they are on comes from their crew's cycle — the
 * schedule, never the trips, so somebody who went out late or came back early
 * is read against the rotation they belong to. Weekends are not workdays.
 *
 * Pure: rows in, statuses and counts out, so it is tested.
 */

import { cycleDayIndex, type RotationCycle } from "./offshore/rotation-math";
import { parseClock, siteMinutes } from "./visitors/daily";

export interface LineMember {
  profileId: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  managerName: string | null;
  /** 1 for a direct report, 2 for their reports, and so on. */
  depth: number;
  crew: string | null;
  /** The crew's cycle, for rotational offshore staff only. */
  rotation: RotationCycle | null;
}

export interface AttendanceLite {
  profile_id: string;
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
}

export type DayStatus =
  /** Checked in today and not yet out. */
  | "on_site"
  /** Came in that day (and left, or the day is over). */
  | "present"
  /** A workday with no check-in. */
  | "absent"
  | "weekend"
  /** Rotational, and the crew's cycle has them offshore. */
  | "offshore"
  /** Rotational, and the crew's cycle has them on their onshore break. */
  | "field_break";

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  on_site: "On site",
  present: "Came in",
  absent: "Not in",
  weekend: "Weekend",
  offshore: "Offshore (rotation)",
  field_break: "Field break (rotation)",
};

export interface WorkHours {
  /** Minutes after midnight, site time; null switches the flag off. */
  start: number | null;
  end: number | null;
}

export function workHours(start: unknown, end: unknown): WorkHours {
  return {
    start: parseClock(typeof start === "string" ? start : null),
    end: parseClock(typeof end === "string" ? end : null),
  };
}

export interface MemberDay {
  date: string;
  status: DayStatus;
  checkIn: string | null;
  checkOut: string | null;
  late: boolean;
  leftEarly: boolean;
}

/** Saturday or Sunday, for an ISO date. */
export function isWeekend(date: string): boolean {
  const d = new Date(date + "T00:00:00Z").getUTCDay();
  return d === 0 || d === 6;
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(to + "T00:00:00Z").getTime();
  for (let t = new Date(from + "T00:00:00Z").getTime(); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** The rotation's reading of a date, or null for somebody not on one. */
export function rotationPhase(rotation: RotationCycle | null, date: string): "offshore" | "field_break" | null {
  if (!rotation) return null;
  const idx = cycleDayIndex(rotation, date);
  if (idx === null) return null;
  return idx < rotation.offshore_days ? "offshore" : "field_break";
}

/** One person's day. A check-in always wins: it is what happened. */
export function memberDay(
  member: Pick<LineMember, "rotation">,
  att: AttendanceLite | undefined,
  date: string,
  today: string,
  hours: WorkHours,
): MemberDay {
  const checkIn = att?.check_in_at ?? null;
  const checkOut = att?.check_out_at ?? null;
  if (checkIn) {
    const workday = !isWeekend(date);
    return {
      date,
      status: !checkOut && date === today ? "on_site" : "present",
      checkIn,
      checkOut,
      late: workday && hours.start !== null && siteMinutes(checkIn) > hours.start,
      leftEarly: workday && hours.end !== null && checkOut !== null && siteMinutes(checkOut) < hours.end,
    };
  }
  const phase = rotationPhase(member.rotation, date);
  const status: DayStatus = phase ?? (isWeekend(date) ? "weekend" : "absent");
  return { date, status, checkIn: null, checkOut: null, late: false, leftEarly: false };
}

export interface MemberSummary {
  /** Days they came in. */
  present: number;
  /** Workdays they were expected and did not come in. */
  absent: number;
  late: number;
  leftEarly: number;
  /** Days the rotation had them offshore or on their break. */
  rotation: number;
  /** Average arrival, minutes after midnight site time; null with no arrivals. */
  avgArrival: number | null;
}

export function summarise(days: MemberDay[]): MemberSummary {
  let present = 0;
  let absent = 0;
  let late = 0;
  let leftEarly = 0;
  let rotation = 0;
  let arrivalSum = 0;
  for (const d of days) {
    if (d.status === "present" || d.status === "on_site") {
      present++;
      arrivalSum += siteMinutes(d.checkIn!);
    }
    if (d.status === "absent") absent++;
    if (d.status === "offshore" || d.status === "field_break") rotation++;
    if (d.late) late++;
    if (d.leftEarly) leftEarly++;
  }
  return { present, absent, late, leftEarly, rotation, avgArrival: present ? Math.round(arrivalSum / present) : null };
}

/** Minutes after midnight as HH:MM. */
export function minutesClock(m: number | null): string {
  if (m === null) return "—";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The period a report may cover: never past today, never back to front, and
 * at most `maxDays` long (the earlier end gives way).
 */
export function clampPeriod(from: string, to: string, today: string, maxDays = 92): { from: string; to: string } {
  const t = to > today ? today : to;
  const f = from > t ? t : from;
  const earliest = new Date(new Date(t + "T00:00:00Z").getTime() - (maxDays - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from: f < earliest ? earliest : f, to: t };
}
