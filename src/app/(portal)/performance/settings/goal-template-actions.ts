"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import {
  GOAL_LEVELS,
  MEASUREMENT_TYPES,
  type GoalLevel,
  type MeasurementType,
} from "@/types/goal-template";

async function ensureHr() {
  const access = await getAccess();
  return access.isHr || access.isSystemAdmin || access.isAdmin;
}

export interface GoalTemplateInput {
  id?: string;
  title: string;
  description?: string | null;
  category?: string | null;
  level: GoalLevel;
  defaultWeight: number;
  measurementType: MeasurementType;
  unit?: string | null;
  strategicObjective?: string | null;
}

export async function saveGoalTemplate(input: GoalTemplateInput): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage the goal library." };
  if (!input.title?.trim()) return { ok: false, error: "Give the goal a title." };
  const level: GoalLevel = GOAL_LEVELS.includes(input.level) ? input.level : "individual";
  const measurementType: MeasurementType = MEASUREMENT_TYPES.includes(input.measurementType)
    ? input.measurementType
    : "percentage";

  const supabase = createClient();
  const fields = {
    title: input.title.trim(),
    description: input.description?.toString().trim() || null,
    category: input.category?.toString().trim() || null,
    level,
    default_weight: Math.max(0, Math.min(100, Math.round(input.defaultWeight || 0))),
    measurement_type: measurementType,
    unit: input.unit?.toString().trim() || null,
    strategic_objective: input.strategicObjective?.toString().trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from("goal_templates").update(fields).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (!tenant) return { ok: false, error: "No tenant in scope." };
    const { error } = await supabase.from("goal_templates").insert({ ...fields, tenant_id: tenant.id });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/performance/settings/goal-library");
  return { ok: true };
}

export async function deleteGoalTemplate(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage the goal library." };
  const supabase = createClient();
  const { error } = await supabase.from("goal_templates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/goal-library");
  return { ok: true };
}
