"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import {
  CYCLE_TYPES,
  type CyclePopulation,
  type CycleType,
  type CycleVisibility,
} from "@/types/cycle-template";

async function ensureHr() {
  const access = await getAccess();
  return access.isHr || access.isSystemAdmin || access.isAdmin;
}

const clampW = (v: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));

export interface CycleTemplateInput {
  id?: string;
  name: string;
  description?: string | null;
  cycleType: CycleType;
  ratingScaleId: string | null;
  weightOkr: number;
  weightCompetency: number;
  weightDevelopment: number;
  requireSecondLevel: boolean;
  reminderDaysBefore: number;
  population: CyclePopulation;
  visibility: CycleVisibility;
}

/** Create or update a cycle template (HR / admin only). */
export async function saveCycleTemplate(input: CycleTemplateInput): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage cycle templates." };
  if (!input.name?.trim()) return { ok: false, error: "Give the template a name." };
  const cycleType: CycleType = CYCLE_TYPES.includes(input.cycleType) ? input.cycleType : "annual";

  const supabase = createClient();
  const fields = {
    name: input.name.trim(),
    description: input.description?.toString().trim() || null,
    cycle_type: cycleType,
    rating_scale_id: input.ratingScaleId || null,
    weight_okr: clampW(input.weightOkr),
    weight_competency: clampW(input.weightCompetency),
    weight_development: clampW(input.weightDevelopment),
    require_second_level: !!input.requireSecondLevel,
    reminder_days_before: Math.max(0, Math.min(90, Math.round(input.reminderDaysBefore || 0))),
    population: input.population ?? { type: "all" },
    visibility: input.visibility,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from("cycle_templates").update(fields).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (!tenant) return { ok: false, error: "No tenant in scope." };
    const { error } = await supabase
      .from("cycle_templates")
      .insert({ ...fields, tenant_id: tenant.id });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/performance/settings/cycle-templates");
  return { ok: true };
}

export async function deleteCycleTemplate(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage cycle templates." };
  const supabase = createClient();
  const { error } = await supabase.from("cycle_templates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/cycle-templates");
  return { ok: true };
}

/** Launch a draft cycle from a template, copying its defaults. */
export async function createCycleFromTemplate(input: {
  templateId: string;
  name: string;
  year: number;
  periodStart: string;
  periodEnd: string;
  goalSettingDeadline?: string;
}): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can launch cycles." };
  if (!input.name?.trim()) return { ok: false, error: "Cycle name is required." };
  if (!input.periodStart || !input.periodEnd)
    return { ok: false, error: "Period start and end are required." };

  const supabase = createClient();
  const { data: tpl } = await supabase
    .from("cycle_templates")
    .select("*")
    .eq("id", input.templateId)
    .maybeSingle();
  if (!tpl) return { ok: false, error: "Template not found." };
  const t = tpl as Record<string, unknown>;

  const { data: meId } = await supabase.auth.getUser();
  const { error } = await supabase.from("appraisal_cycles").insert({
    tenant_id: t.tenant_id,
    name: input.name.trim(),
    year: Math.floor(input.year) || new Date().getFullYear(),
    period_start: input.periodStart,
    period_end: input.periodEnd,
    goal_setting_deadline: input.goalSettingDeadline || null,
    cycle_type: t.cycle_type ?? "annual",
    template_id: t.id,
    rating_scale_id: t.rating_scale_id ?? null,
    weight_okr: t.weight_okr ?? 60,
    weight_competency: t.weight_competency ?? 30,
    weight_development: t.weight_development ?? 10,
    require_second_level: !!t.require_second_level,
    ...(Array.isArray(t.rating_bands) ? { rating_bands: t.rating_bands } : {}),
    config: t.config ?? {},
    created_by: meId.user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/cycle-templates");
  revalidatePath("/performance/appraisals");
  return { ok: true };
}
