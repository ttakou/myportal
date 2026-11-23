/**
 * The order the Dispatcher works manifests in: today's first, then the coming
 * days soonest first, then any past day still open (most recent first). On
 * one day, MOB before DEMOB.
 */
export function manifestWorkOrder<T extends { scheduled_date: string; direction?: string | null }>(list: T[], todayIso: string): T[] {
  const band = (d: string) => (d === todayIso ? 0 : d > todayIso ? 1 : 2);
  const dir = (m: T) => (m.direction === "in" ? 1 : 0);
  return [...list].sort((a, b) => {
    const ba = band(a.scheduled_date);
    const bb = band(b.scheduled_date);
    if (ba !== bb) return ba - bb;
    if (a.scheduled_date !== b.scheduled_date) {
      return ba === 2 ? b.scheduled_date.localeCompare(a.scheduled_date) : a.scheduled_date.localeCompare(b.scheduled_date);
    }
    return dir(a) - dir(b);
  });
}

/** Today on the site's clock (Douala), as the manifests' dates are kept. */
export const siteToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
