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
 * The catering contractor's own staff (Pellegrini) are on board too but are
 * not served from the sheet: they are listed last, as "caterer", with no meal
 * ticked; the desk can tick one if needed.
 *
 * Pure: rows in, decisions out.
 */

export interface SheetTrip {
  name: string;
  status: string;
  mobilize_date: string;
  demob_date: string | null;
  installation_id: string | null;
  /** Their employer, from the roster: the caterer's own staff go last, unticked. */
  company?: string | null;
}

export interface SheetVisit {
  name: string;
  status: string;
  depart_date: string;
  return_date: string | null;
  installation_id: string | null;
}

export type SheetCategory = "staff" | "visitor" | "casual" | "caterer";

export interface SheetPerson {
  name: string;
  category: Exclude<SheetCategory, "casual">;
}

/** The catering contractor (Pellegrini, also spelt Pelligrini on the roster). */
export const isCaterer = (company: string | null | undefined) => /^\s*pel+[ei]grini\b/i.test(company ?? "");

/** The meals a new row starts with: every one for the people the sheet serves, none for the caterer's own staff. */
export function startingMeals(category: SheetCategory): { breakfast: boolean; snack: boolean; lunch: boolean; dinner: boolean; lodging: boolean } {
  const on = category !== "caterer";
  return { breakfast: on, snack: on, lunch: on, dinner: on, lodging: on };
}

const ORDER: Record<SheetCategory, number> = { staff: 0, visitor: 1, casual: 2, caterer: 3 };

/** Sheet order: staff, visitors, casual diners, then the caterer's staff, each by name. */
export function sheetOrder<T extends { category: string; person_name: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (ORDER[a.category as SheetCategory] ?? 9) - (ORDER[b.category as SheetCategory] ?? 9) ||
      a.person_name.localeCompare(b.person_name),
  );
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
    if (aboard && !out.has(t.name)) out.set(t.name, { name: t.name, category: isCaterer(t.company) ? "caterer" : "staff" });
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
): { add: SheetPerson[]; removeIds: string[]; toCaterer: string[] } {
  const onSheet = new Set(saved.map((e) => e.person_name));
  const aboardBy = new Map(aboard.map((p) => [p.name, p]));
  return {
    add: aboard.filter((p) => !onSheet.has(p.name)),
    removeIds: saved
      .filter((e) => e.category !== "casual" && !aboardBy.has(e.person_name))
      .map((e) => e.id),
    // Caterer's staff saved earlier as ordinary staff: moved to their group, unticked.
    toCaterer: saved
      .filter((e) => e.category === "staff" && aboardBy.get(e.person_name)?.category === "caterer")
      .map((e) => e.id),
  };
}
