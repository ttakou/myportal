/**
 * Closing manifests whose day has passed.
 *
 * A manifest left open after its date says nothing about who actually
 * travelled. Each night the past ones are closed (completed), and everyone on
 * them whose travel the records confirm is ticked as boarded: a trip or visit
 * that started (MOB) or ended (DEMOB) within a couple of days of the
 * manifest's date. Nobody else is touched — an unconfirmed passenger stays
 * "booked" for the desk to check, rather than being called a no-show.
 *
 * Pure: rows in, decisions out.
 */

export const CONFIRM_WINDOW_DAYS = 2;

export interface ClosePax {
  id: string;
  profile_id: string | null;
  visit_request_id: string | null;
  boarded: boolean;
  no_show: boolean;
}

export interface CloseTrip {
  profile_id: string;
  status: string;
  mobilize_date: string;
  demob_date: string | null;
}

export interface CloseVisit {
  id: string;
  status: string;
  depart_date: string;
  return_date: string | null;
}

const dayMs = (iso: string) => Date.parse(iso + "T00:00:00Z");
const near = (a: string | null, b: string) => !!a && Math.abs(dayMs(a) - dayMs(b)) <= CONFIRM_WINDOW_DAYS * 86_400_000;

/** The passengers on one past manifest whose travel the records confirm (and who are not ticked yet). */
export function confirmedTravellers(input: {
  date: string;
  direction: "out" | "in";
  pax: ClosePax[];
  trips: CloseTrip[];
  visits: CloseVisit[];
}): string[] {
  const { date, direction } = input;
  const tripsBy = new Map<string, CloseTrip[]>();
  for (const t of input.trips) tripsBy.set(t.profile_id, [...(tripsBy.get(t.profile_id) ?? []), t]);
  const visitBy = new Map(input.visits.map((v) => [v.id, v]));

  return input.pax
    .filter((p) => !p.boarded && !p.no_show)
    .filter((p) => {
      if (p.visit_request_id) {
        const v = visitBy.get(p.visit_request_id);
        if (!v) return false;
        return direction === "out"
          ? ["onboard", "returned"].includes(v.status) && near(v.depart_date, date)
          : v.status === "returned" && near(v.return_date, date);
      }
      if (!p.profile_id) return false;
      return (tripsBy.get(p.profile_id) ?? []).some((t) =>
        direction === "out"
          ? ["onboard", "demobilised"].includes(t.status) && near(t.mobilize_date, date)
          : t.status === "demobilised" && near(t.demob_date, date),
      );
    })
    .map((p) => p.id);
}
