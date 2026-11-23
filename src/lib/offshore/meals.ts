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
    .select("id, person_name, category, breakfast, snack, lunch, dinner, lodging")
    .eq("installation_id", installationId)
    .eq("meal_date", date);
  // Staff, visitors, casual diners, then the caterer's own staff — each by name.
  return sheetOrder((data ?? []) as MealEntry[]);
}
