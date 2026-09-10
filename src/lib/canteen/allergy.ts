/**
 * Personal allergies against a dish's allergen list. Pure.
 *
 * Both sides are free text typed by different people ("Peanuts",
 * "peanut", "arachide"), so matching is by normalised word stem: lower
 * case, accents stripped, trailing "s" dropped, and either side containing
 * the other counts.
 */

/** The allergens the menu editor and the profile picker offer first. */
export const COMMON_ALLERGENS = [
  "Peanuts",
  "Tree nuts",
  "Milk",
  "Eggs",
  "Fish",
  "Shellfish",
  "Wheat",
  "Gluten",
  "Soy",
  "Sesame",
  "Mustard",
  "Celery",
  "Sulphites",
] as const;

export function allergenKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/s$/, "");
}

/** A tidy list: trimmed, de-duplicated by key, blanks dropped. */
export function parseAllergens(text: string | string[]): string[] {
  const parts = Array.isArray(text) ? text : text.split(/[,;\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim().replace(/\s+/g, " ");
    const k = allergenKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** The dish allergens that hit the person's list, in the dish's words. */
export function allergyHits(dishAllergens: string[], mine: string[]): string[] {
  const keys = mine.map(allergenKey).filter(Boolean);
  if (keys.length === 0) return [];
  return dishAllergens.filter((a) => {
    const k = allergenKey(a);
    return k.length > 0 && keys.some((m) => k === m || k.includes(m) || m.includes(k));
  });
}
