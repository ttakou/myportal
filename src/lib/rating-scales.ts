import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RatingScale, RatingScaleKind, RatingScaleLevel } from "@/types/rating-scale";
import { versionedFromRow } from "@/types/versioning";

function scaleFromRow(r: Record<string, unknown>): RatingScale {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: (r.description as string | null) ?? null,
    kind: (r.kind as RatingScaleKind) ?? "performance",
    levels: Array.isArray(r.levels) ? (r.levels as RatingScaleLevel[]) : [],
    allowDecimals: !!r.allow_decimals,
    commentRequired: !!r.comment_required,
    evidenceRequired: !!r.evidence_required,
    showNumericToEmployee: r.show_numeric_to_employee !== false,
    isDefault: !!r.is_default,
    isActive: r.is_active !== false,
    ...versionedFromRow(r),
  };
}

/** All of the tenant's rating scales, defaults first then by name. */
export async function getRatingScales(): Promise<RatingScale[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("rating_scales")
    .select("*")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map(scaleFromRow);
}

/** The tenant's default scale for a kind (falls back to any active scale). */
export async function getDefaultScale(
  kind: RatingScaleKind = "performance",
): Promise<RatingScale | null> {
  const scales = await getRatingScales();
  return (
    scales.find((s) => s.kind === kind && s.isDefault) ??
    scales.find((s) => s.kind === kind && s.isActive) ??
    null
  );
}
