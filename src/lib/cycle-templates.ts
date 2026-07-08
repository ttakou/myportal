import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_VISIBILITY,
  type CyclePopulation,
  type CycleTemplate,
  type CycleType,
  type CycleVisibility,
} from "@/types/cycle-template";
import { versionedFromRow } from "@/types/versioning";

function templateFromRow(r: Record<string, unknown>): CycleTemplate {
  const pop = (r.population as CyclePopulation) ?? { type: "all" };
  const vis = (r.visibility as CycleVisibility) ?? DEFAULT_VISIBILITY;
  return {
    ...versionedFromRow(r),
    id: String(r.id),
    name: String(r.name ?? ""),
    description: (r.description as string | null) ?? null,
    cycleType: (r.cycle_type as CycleType) ?? "annual",
    ratingScaleId: (r.rating_scale_id as string | null) ?? null,
    weightOkr: Number(r.weight_okr ?? 60),
    weightCompetency: Number(r.weight_competency ?? 30),
    weightDevelopment: Number(r.weight_development ?? 10),
    requireSecondLevel: !!r.require_second_level,
    reminderDaysBefore: Number(r.reminder_days_before ?? 7),
    population: pop.type ? pop : { type: "all" },
    visibility: { ...DEFAULT_VISIBILITY, ...vis },
    isActive: r.is_active !== false,
  };
}

/** A template's name + raw config jsonb (workflow stages, form sections). */
export async function getTemplateConfig(
  id: string,
): Promise<{ name: string; config: Record<string, unknown> } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cycle_templates")
    .select("name, config")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    name: String(row.name ?? ""),
    config: (row.config as Record<string, unknown>) ?? {},
  };
}

/** The tenant's cycle templates (active first, then by name). */
export async function getCycleTemplates(): Promise<CycleTemplate[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("cycle_templates")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map(templateFromRow);
}
