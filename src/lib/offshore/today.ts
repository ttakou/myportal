/**
 * The "Today" page's rules: what is due before tonight's run, and the day's
 * meal count. Pure: rows in, answers out. Dates are site dates "YYYY-MM-DD".
 */

/** The day after `iso`. */
export function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * A decision is due before tonight's run when the first day it changes is
 * tomorrow or earlier: the run at 05:00 tomorrow carries out what is approved
 * by then, and nothing later.
 */
export function dueBeforeTonight(firstDay: string | null | undefined, today: string): boolean {
  return !!firstDay && firstDay <= nextDay(today);
}

/** The first day a date change touches: the earlier of the two dates. */
export function firstDayOf(scheduled: string | null | undefined, requested: string | null | undefined): string | null {
  if (!scheduled) return requested ?? null;
  if (!requested) return scheduled;
  return scheduled < requested ? scheduled : requested;
}

export interface MealRow {
  installation_id: string | null;
  category: string;
  breakfast: boolean;
  snack: boolean;
  lunch: boolean;
  dinner: boolean;
  lodging: boolean;
}

export interface MealTotals {
  installation_id: string | null;
  people: number;
  breakfast: number;
  snack: number;
  lunch: number;
  dinner: number;
  lodging: number;
}

/** The day's meal count per installation, from the meal sheet's ticks. */
export function mealTotals(rows: MealRow[]): MealTotals[] {
  const by = new Map<string, MealTotals>();
  for (const r of rows) {
    const k = r.installation_id ?? "";
    const t =
      by.get(k) ??
      { installation_id: r.installation_id, people: 0, breakfast: 0, snack: 0, lunch: 0, dinner: 0, lodging: 0 };
    t.people++;
    if (r.breakfast) t.breakfast++;
    if (r.snack) t.snack++;
    if (r.lunch) t.lunch++;
    if (r.dinner) t.dinner++;
    if (r.lodging) t.lodging++;
    by.set(k, t);
  }
  return [...by.values()];
}
