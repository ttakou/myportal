/**
 * When a monthly savings deposit lands: contributions are paid on the last
 * Friday of the month they belong to, so an imported contribution is dated
 * that day rather than the day the file was uploaded. Pure, UTC dates.
 */

/** "2026-09" (or "2026-09-01") → "2026-09-25", the month's last Friday. */
export function lastFridayOfMonth(period: string): string {
  const [y, m] = period.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this one
  const back = (last.getUTCDay() - 5 + 7) % 7; // Friday = 5
  last.setUTCDate(last.getUTCDate() - back);
  return last.toISOString().slice(0, 10);
}

/**
 * The timestamp to stamp on a contribution for `period`: noon UTC on the
 * month's last Friday, or now when that Friday has not come yet (a month
 * imported early is not dated in the future).
 */
export function depositTimestamp(period: string, nowIso: string = new Date().toISOString()): string {
  const friday = `${lastFridayOfMonth(period)}T12:00:00.000Z`;
  return friday < nowIso ? friday : nowIso;
}
