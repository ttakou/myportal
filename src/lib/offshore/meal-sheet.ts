/**
 * Who belongs on a day's meal sheet, and how a saved sheet is brought back in
 * line with POB.
 *
 * The sheet follows POB for that date: everyone on board eats. A first
 * generation ticks every meal for everyone; the catering desk unticks what was
 * not served. Generating again adds whoever has boarded since and drops whoever
 * is no longer on board, but keeps the ticks already set for everyone else and
 * any casual diner added by hand.
 *
 * Pure: rows in, decisions out.
 */

export interface SheetTrip {
  name: string;
  status: string;
  mobilize_date: string;
  demob_date: string | null;
  installation_id: string | null;
}

export interface SheetVisit {
  name: string;
  status: string;
  depart_date: string;
  return_date: string | null;
  installation_id: string | null;
}

export interface SheetPerson {
  name: string;
  category: "staff" | "visitor";
}

/** Same installation, or none recorded (most trips carry none) — never another one. */
const here = (rowInstallation: string | null, installationId: string) =>
  !rowInstallation || rowInstallation === installationId;

/**
 * Everyone on board `installationId` on `date`.
 *
 * Someone still marked on board counts from their arrival on, even past a
 * planned departure that has not happened. Someone already demobilised counts
 * only for the days before they left, so a past day's sheet can still be
 * rebuilt. Names are unique on the sheet; the first one wins.
 */
export function aboardOn(
  date: string,
  installationId: string,
  trips: SheetTrip[],
  visits: SheetVisit[],
): SheetPerson[] {
  const out = new Map<string, SheetPerson>();
  for (const t of trips) {
    if (!here(t.installation_id, installationId) || t.mobilize_date > date) continue;
    const aboard =
      t.status === "onboard" || (t.status === "demobilised" && !!t.demob_date && t.demob_date > date);
    if (aboard && !out.has(t.name)) out.set(t.name, { name: t.name, category: "staff" });
  }
  for (const v of visits) {
    if (!here(v.installation_id, installationId) || v.depart_date > date) continue;
    const aboard =
      ["onboard", "approved"].includes(v.status)
        ? !v.return_date || v.return_date >= date
        : v.status === "returned" && !!v.return_date && v.return_date > date;
    if (aboard && !out.has(v.name)) out.set(v.name, { name: v.name, category: "visitor" });
  }
  return [...out.values()];
}

export interface SavedEntry {
  id: string;
  person_name: string;
  category: string;
}

/**
 * What to change on a saved sheet: who to add (every meal ticked) and which
 * generated rows to drop because that person is no longer on board. Casual
 * diners were added by hand and are never dropped.
 */
export function syncMealSheet(
  saved: SavedEntry[],
  aboard: SheetPerson[],
): { add: SheetPerson[]; removeIds: string[] } {
  const onSheet = new Set(saved.map((e) => e.person_name));
  const aboardNames = new Set(aboard.map((p) => p.name));
  return {
    add: aboard.filter((p) => !onSheet.has(p.name)),
    removeIds: saved
      .filter((e) => e.category !== "casual" && !aboardNames.has(e.person_name))
      .map((e) => e.id),
  };
}
