/**
 * Saved places. A tenant names its usual pickup and drop-off points once;
 * whatever someone types is folded onto the saved spelling when it is the
 * same place, so "main gate" and "Main Gate" do not become two places in
 * the planner and the reports. Pure.
 */

import type { Place } from "@/types/transport";

/** Trimmed, inner whitespace collapsed. */
export function normalisePlaceName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** The saved spelling when the typed name matches a place case-insensitively; else the typed name, tidied. */
export function canonicalPlace(raw: string, places: Pick<Place, "name">[]): string {
  const typed = normalisePlaceName(raw);
  const key = typed.toLowerCase();
  const hit = places.find((p) => p.name.toLowerCase() === key);
  return hit ? hit.name : typed;
}

/** Whether a typed name is already saved. */
export function isSavedPlace(raw: string, places: Pick<Place, "name">[]): boolean {
  const key = normalisePlaceName(raw).toLowerCase();
  return key.length > 0 && places.some((p) => p.name.toLowerCase() === key);
}
