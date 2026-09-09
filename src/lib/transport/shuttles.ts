/**
 * Which shuttles run on a day, and when. Pure.
 *
 * A shuttle names a local departure time and the weekdays it runs; the
 * nightly job turns that into one task per shuttle per day. The tenant's
 * clock is one hour ahead of UTC, so 06:30 local is 05:30Z.
 */

import type { Shuttle } from "@/types/transport";
import { TENANT_UTC_OFFSET_HOURS } from "./day-plan";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date. */
export function weekdayOf(dateIso: string): number {
  return new Date(dateIso + "T00:00:00Z").getUTCDay();
}

export function shuttleRunsOn(shuttle: Pick<Shuttle, "is_active" | "days_of_week">, dateIso: string): boolean {
  return shuttle.is_active && shuttle.days_of_week.includes(weekdayOf(dateIso));
}

/** The UTC instant a shuttle departs on a given local date. */
export function shuttleDepartAt(
  shuttle: Pick<Shuttle, "depart_time">,
  dateIso: string,
  offsetHours = TENANT_UTC_OFFSET_HOURS,
): string {
  const [h, m] = shuttle.depart_time.split(":").map(Number);
  const local = Date.parse(dateIso + "T00:00:00Z") + (h * 60 + m) * 60_000;
  return new Date(local - offsetHours * 3_600_000).toISOString();
}

/** "Mon–Fri", "Mon, Wed, Fri", "Every day", "Never". */
export function describeDays(days: number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return "Every day";
  if (set.length === 0) return "Never";
  if (set.join(",") === "1,2,3,4,5") return "Mon–Fri";
  if (set.join(",") === "0,6") return "Weekends";
  return set.map((d) => DAY_LABELS[d]).join(", ");
}

/** The shuttles that run on a date, with the task each would make. */
export function shuttlesDue(shuttles: Shuttle[], dateIso: string) {
  return shuttles
    .filter((s) => shuttleRunsOn(s, dateIso))
    .map((s) => ({ shuttle: s, departAt: shuttleDepartAt(s, dateIso) }))
    .sort((a, b) => a.departAt.localeCompare(b.departAt));
}
