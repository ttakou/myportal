import { createClient } from "@/lib/supabase/server";
import type { MealEntry } from "@/types/offshore";
import { sheetOrder } from "./meal-sheet";

/** Meal-sheet rows already saved for an installation + date. */
export async function getMealSheet(
  installationId: string,
  date: string,
): Promise<MealEntry[]> {
  if (!installationId || !date) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_meal_entries")
    .select("id, person_name, category, movement, breakfast, snack, lunch, dinner, lodging")
    .eq("installation_id", installationId)
    .eq("meal_date", date);
  // Arriving, leaving, then staff, visitors, casual diners; the caterer's own staff last.
  return sheetOrder((data ?? []) as MealEntry[]);
}
