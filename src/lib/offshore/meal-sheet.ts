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
 * Crew-change days: whoever arrives that day (MOB) and whoever leaves (DEMOB)
 * are both on the sheet, marked and grouped apart. An arrival starts with
 * snack, lunch, dinner and a bed; a leaver with breakfast, snack and lunch,
 * and no dinner or bed. A visitor in and out the same day: snack and lunch.
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

/** How the person's day goes: arrives (MOB), leaves (DEMOB), both, or null when staying. */
export type SheetMovement = "arrival" | "departure" | "day";

export interface SheetPerson {
  name: string;
  category: Exclude<SheetCategory, "casual">;
  /** Left out (or null) for someone on board all day. */
  movement?: SheetMovement | null;
}

export const MOVEMENT_LABEL: Record<SheetMovement, string> = {
  arrival: "Arriving (MOB)",
  departure: "Leaving (DEMOB)",
  day: "In and out today",
};

/** The catering contractor (Pellegrini, also spelt Pelligrini on the roster). */
export const isCaterer = (company: string | null | undefined) => /^\s*pel+[ei]grini\b/i.test(company ?? "");

/**
 * The meals a new row starts with. Staying: every one. Arriving: snack, lunch,
 * dinner and a bed (they come in after breakfast). Leaving: breakfast, snack
 * and lunch (gone before dinner, no bed). In and out the same day: snack and
 * lunch. The caterer's own staff: none, whatever their day.
 */
export function startingMeals(
  category: SheetCategory,
  movement: SheetMovement | null = null,
): { breakfast: boolean; snack: boolean; lunch: boolean; dinner: boolean; lodging: boolean } {
  if (category === "caterer") return { breakfast: false, snack: false, lunch: false, dinner: false, lodging: false };
  if (movement === "arrival") return { breakfast: false, snack: true, lunch: true, dinner: true, lodging: true };
  if (movement === "departure") return { breakfast: true, snack: true, lunch: true, dinner: false, lodging: false };
  if (movement === "day") return { breakfast: false, snack: true, lunch: true, dinner: false, lodging: false };
  return { breakfast: true, snack: true, lunch: true, dinner: true, lodging: true };
}

/** The sheet's groups, in order: arriving, leaving, in and out, on board, then the caterer's staff. */
export type SheetGroup = "arrival" | "departure" | "day" | "onboard" | "caterer";
export const SHEET_GROUPS: SheetGroup[] = ["arrival", "departure", "day", "onboard", "caterer"];
export const GROUP_LABEL: Record<SheetGroup, string> = {
  ...MOVEMENT_LABEL,
  onboard: "On board",
  caterer: "Pellegrini (catering)",
};

export function sheetGroup(row: { category: string; movement?: string | null }): SheetGroup {
  if (row.category === "caterer") return "caterer";
  if (row.movement === "arrival" || row.movement === "departure" || row.movement === "day") return row.movement;
  return "onboard";
}

const ORDER: Record<SheetCategory, number> = { staff: 0, visitor: 1, casual: 2, caterer: 3 };

/**
 * Sheet order: arriving, leaving, in and out, then everyone staying (staff,
 * visitors, casual diners), then the caterer's staff; by category and name
 * within each group.
 */
export function sheetOrder<T extends { category: string; person_name: string; movement?: string | null }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      SHEET_GROUPS.indexOf(sheetGroup(a)) - SHEET_GROUPS.indexOf(sheetGroup(b)) ||
      (ORDER[a.category as SheetCategory] ?? 9) - (ORDER[b.category as SheetCategory] ?? 9) ||
      a.person_name.localeCompare(b.person_name),
  );
}

/** Same installation, or none recorded (most trips carry none) — never another one. */
const here = (rowInstallation: string | null, installationId: string) =>
  !rowInstallation || rowInstallation === installationId;

/** Arriving and/or leaving on `date`, from the first and last day there. */
function movementOn(date: string, first: string, last: string | null): SheetMovement | null {
  const arrives = first === date;
  const leaves = last === date;
  return arrives && leaves ? "day" : arrives ? "arrival" : leaves ? "departure" : null;
}

/**
 * Everyone on board `installationId` on `date`, with how their day goes.
 *
 * Someone still marked on board counts from their arrival on, even past a
 * planned departure that has not happened (so they are staying, not leaving).
 * Someone already demobilised counts up to and including the day they left —
 * that day as a leaver — so a past day's sheet can still be rebuilt. Names
 * are unique on the sheet; the first one wins.
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
    let movement: SheetMovement | null;
    if (t.status === "onboard") movement = movementOn(date, t.mobilize_date, null);
    else if (t.status === "demobilised" && !!t.demob_date && t.demob_date >= date)
      movement = movementOn(date, t.mobilize_date, t.demob_date);
    else continue;
    if (!out.has(t.name)) out.set(t.name, { name: t.name, category: isCaterer(t.company) ? "caterer" : "staff", movement });
  }
  for (const v of visits) {
    if (!here(v.installation_id, installationId) || v.depart_date > date) continue;
    const aboard =
      ["onboard", "approved"].includes(v.status)
        ? !v.return_date || v.return_date >= date
        : v.status === "returned" && !!v.return_date && v.return_date >= date;
    if (aboard && !out.has(v.name))
      out.set(v.name, { name: v.name, category: "visitor", movement: movementOn(date, v.depart_date, v.return_date) });
  }
  return [...out.values()];
}

export interface SavedEntry {
  id: string;
  person_name: string;
  category: string;
  movement?: string | null;
}

/**
 * What to change on a saved sheet: who to add (ticked for their day), which
 * generated rows to drop because that person is no longer on board, and
 * whose day has changed since (a run postponed, a no-show, the sheet made
 * ahead of the crew change): those are re-marked and their ticks start over
 * for the new day. Casual diners were added by hand and are never touched.
 */
export function syncMealSheet(
  saved: SavedEntry[],
  aboard: SheetPerson[],
): {
  add: SheetPerson[];
  removeIds: string[];
  toCaterer: string[];
  remark: { id: string; category: SheetPerson["category"]; movement: SheetMovement | null }[];
} {
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
    remark: saved.flatMap((e) => {
      const p = aboardBy.get(e.person_name);
      if (!p || e.category === "casual") return [];
      const now = p.movement ?? null;
      return (e.movement ?? null) === now ? [] : [{ id: e.id, category: p.category, movement: now }];
    }),
  };
}
