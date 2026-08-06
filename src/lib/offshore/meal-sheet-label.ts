/**
 * The label a generated meal sheet carries.
 *
 * Meal entries were always saved per installation and date, but there was no
 * titled document to review, sign or file — every other offshore report had
 * one. The sheet is identified by its date first, because that is how the
 * galley refers to it.
 */

export interface MealSheetLabel {
  /** "Meal sheet of 16 Jun 2026". */
  title: string;
  /** Installation and the ISO date, for the report subtitle. */
  subtitle: string;
  /** Safe for a filename: "meal-sheet-2026-06-16". */
  slug: string;
}

/** Long-form date, or the raw value if it is not a parseable ISO day. */
function longDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function mealSheetLabel(dateIso: string, installationName?: string | null): MealSheetLabel {
  const place = installationName?.trim();
  return {
    title: `Meal sheet of ${longDate(dateIso)}`,
    subtitle: place ? `${place} · ${dateIso}` : dateIso,
    slug: `meal-sheet-${dateIso}`,
  };
}
