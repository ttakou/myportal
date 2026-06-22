import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { GoalLevel, GoalTemplate, MeasurementType } from "@/types/goal-template";
import { versionedFromRow } from "@/types/versioning";

function fromRow(r: Record<string, unknown>): GoalTemplate {
  return {
    ...versionedFromRow(r),
    id: String(r.id),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    level: (r.level as GoalLevel) ?? "individual",
    defaultWeight: Number(r.default_weight ?? 0),
    measurementType: (r.measurement_type as MeasurementType) ?? "percentage",
    unit: (r.unit as string | null) ?? null,
    strategicObjective: (r.strategic_objective as string | null) ?? null,
    isActive: r.is_active !== false,
  };
}

/** The tenant's goal library (corporate first, then by title). */
export async function getGoalTemplates(): Promise<GoalTemplate[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("goal_templates")
    .select("*")
    .order("level", { ascending: true })
    .order("title", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}
