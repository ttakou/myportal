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
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
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
    effective_from: input.effectiveFrom || null,
    effective_to: input.effectiveTo || null,
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

export async function publishGoalTemplate(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage the goal library." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("goal_templates")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by: user?.id ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/goal-library");
  return { ok: true };
}

export async function newGoalTemplateVersion(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage the goal library." };
  const supabase = createClient();
  const { data: src } = await supabase.from("goal_templates").select("*").eq("id", id).maybeSingle();
  if (!src) return { ok: false, error: "Goal not found." };
  const insert = { ...(src as Record<string, unknown>) };
  delete insert.id;
  delete insert.created_at;
  delete insert.published_at;
  delete insert.published_by;
  insert.version = Number((src as Record<string, unknown>).version ?? 1) + 1;
  insert.status = "draft";
  insert.is_active = false;
  const { error } = await supabase.from("goal_templates").insert(insert);
  if (error) return { ok: false, error: error.message };
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
