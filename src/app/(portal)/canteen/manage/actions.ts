"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { MealPeriod } from "@/types/canteen";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

const MEALS: MealPeriod[] = ["breakfast", "lunch", "dinner"];

export async function addDish(input: {
  kitchenId: string;
  serviceDate: string;
  mealPeriod: MealPeriod;
  name: string;
  description?: string;
  capacity?: number | null;
}): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) {
    return { ok: false, error: "Not authorized." };
  }
  if (!MEALS.includes(input.mealPeriod)) {
    return { ok: false, error: "Invalid meal period." };
  }
  if (!input.name.trim()) return { ok: false, error: "Dish name is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate)) {
    return { ok: false, error: "Invalid date." };
  }

  const supabase = createClient();
  // tenant_id is enforced by RLS via the kitchen's tenant; set from caller tenant.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("canteen_dishes").insert({
    tenant_id: tenant.id,
    kitchen_id: input.kitchenId,
    service_date: input.serviceDate,
    meal_period: input.mealPeriod,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    capacity:
      input.capacity === undefined || input.capacity === null
        ? null
        : Math.max(0, Math.floor(input.capacity)),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: true };
}

export async function setDishActive(
  dishId: string,
  isActive: boolean,
): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) {
    return { ok: false, error: "Not authorized." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_dishes")
    .update({ is_active: isActive })
    .eq("id", dishId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: true };
}

// ---- Dish option groups / options ------------------------------------------

export async function addOptionGroup(input: {
  dishId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
}): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  if (!input.name.trim()) return { ok: false, error: "Group name is required." };
  const min = Math.max(0, Math.floor(input.minSelect));
  const max = Math.max(1, Math.floor(input.maxSelect));
  if (max < min) return { ok: false, error: "Max must be ≥ min." };

  const supabase = createClient();
  const { error } = await supabase.from("canteen_option_groups").insert({
    dish_id: input.dishId,
    name: input.name.trim(),
    min_select: min,
    max_select: max,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: true };
}

export async function addOption(
  groupId: string,
  name: string,
): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  if (!name.trim()) return { ok: false, error: "Option name is required." };
  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_options")
    .insert({ group_id: groupId, name: name.trim() });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: true };
}

export async function deleteOption(optionId: string): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("canteen_options").delete().eq("id", optionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: true };
}

export async function updateDishDetails(input: {
  dishId: string;
  description?: string;
  ingredients?: string;
  allergens?: string; // comma-separated
  capacity?: number | null;
  available?: boolean;
  changeNote?: string;
}): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.ingredients !== undefined) patch.ingredients = input.ingredients.trim() || null;
  if (input.allergens !== undefined)
    patch.allergens = input.allergens
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (input.capacity !== undefined)
    patch.capacity = input.capacity === null ? null : Math.max(0, Math.floor(input.capacity));
  if (input.available !== undefined) patch.available = input.available;
  if (input.changeNote !== undefined) patch.change_note = input.changeNote.trim() || null;

  const { error } = await supabase.from("canteen_dishes").update(patch).eq("id", input.dishId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: true };
}

export async function setDishPhoto(dishId: string, photoUrl: string | null): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_dishes")
    .update({ photo_url: photoUrl })
    .eq("id", dishId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: true };
}

export async function copyMenu(fromDate: string, toDate: string): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate))
    return { ok: false, error: "Invalid date." };
  if (fromDate === toDate) return { ok: false, error: "Pick a different target date." };
  const supabase = createClient();
  const { data, error } = await supabase.rpc("canteen_copy_menu", { p_from: fromDate, p_to: toDate });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: typeof data === "number" ? true : true, error: data === 0 ? "Nothing to copy from that date." : undefined };
}

export async function deleteOptionGroup(groupId: string): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_option_groups")
    .delete()
    .eq("id", groupId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/manage");
  revalidatePath("/canteen");
  return { ok: true };
}
