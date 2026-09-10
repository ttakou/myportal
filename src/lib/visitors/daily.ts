/**
 * What the visitor jobs decide, and the clock they decide it on. The site
 * runs on Africa/Douala time, one hour ahead of UTC with no daylight
 * saving. Pure.
 */

export const SITE_UTC_OFFSET_HOURS = 1;

/** YYYY-MM-DD on the site's clock. */
export function siteDate(iso: string, offsetHours = SITE_UTC_OFFSET_HOURS): string {
  return new Date(Date.parse(iso) + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** "HH:MM" on the site's clock; "—" for nothing. */
export function siteClock(iso: string | null | undefined, offsetHours = SITE_UTC_OFFSET_HOURS): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t + offsetHours * 3_600_000).toISOString().slice(11, 16);
}

/** Minutes past site midnight. */
export function siteMinutes(iso: string, offsetHours = SITE_UTC_OFFSET_HOURS): number {
  const d = new Date(Date.parse(iso) + offsetHours * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "18:30" → 1110; anything else → null. */
export function parseClock(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Whether an instant falls outside the working window, on the site's
 * clock. The window may wrap midnight ("18:00" to "06:00" means the night).
 */
export function isAfterHours(iso: string, from: string, to: string): boolean {
  const start = parseClock(from);
  const end = parseClock(to);
  if (start === null || end === null || start === end) return false;
  const m = siteMinutes(iso);
  // Working hours run from `to` (morning) to `from` (evening); after hours is the rest.
  return end < start ? m < end || m >= start : m >= start && m < end ? true : false;
}

export interface VisitLite {
  id: string;
  status: string;
  visit_date: string;
  visit_until: string | null;
  host_id?: string | null;
}

/** Pre-registered visits that are still expected on a date. */
export function expectedOn<T extends VisitLite>(visits: T[], dateIso: string): T[] {
  return visits.filter(
    (v) => v.status === "pre_registered" && (v.visit_until ? v.visit_date <= dateIso && dateIso <= v.visit_until : v.visit_date === dateIso),
  );
}

/** Pre-registered visits whose whole window has passed: they never came. */
export function neverCame<T extends VisitLite>(visits: T[], todayIso: string): T[] {
  return visits.filter((v) => v.status === "pre_registered" && (v.visit_until ?? v.visit_date) < todayIso);
}

export interface OnSiteLite {
  id: string;
  check_in_at: string | null;
  overstay_alerted_at: string | null;
}

/**
 * People still on site past the cutoff hour, not yet told about. A visitor
 * who arrived after the cutoff (a night call-out) is not an overstay until
 * the next day's cutoff.
 */
export function overstays<T extends OnSiteLite>(onSite: T[], nowIso: string, cutoff: string): T[] {
  const c = parseClock(cutoff);
  if (c === null) return [];
  if (siteMinutes(nowIso) < c) return [];
  const today = siteDate(nowIso);
  return onSite.filter((v) => {
    if (v.overstay_alerted_at && siteDate(v.overstay_alerted_at) === today) return false;
    if (!v.check_in_at) return true;
    return siteDate(v.check_in_at) < today || siteMinutes(v.check_in_at) < c;
  });
}
