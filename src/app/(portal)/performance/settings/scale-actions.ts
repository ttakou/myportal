"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import {
  RATING_SCALE_KINDS,
  type RatingScaleKind,
  type RatingScaleLevel,
} from "@/types/rating-scale";

async function ensureHr() {
  const access = await getAccess();
  return access.isHr || access.isSystemAdmin || access.isAdmin;
}

function cleanLevels(raw: RatingScaleLevel[]): RatingScaleLevel[] {
  return (raw ?? [])
    .filter((l) => l && String(l.label ?? "").trim() && Number.isFinite(Number(l.value)))
    .map((l) => ({
      value: Number(l.value),
      label: String(l.label).trim(),
      description: l.description?.toString().trim() || null,
      color: l.color?.toString().trim() || null,
    }))
    .sort((a, b) => b.value - a.value);
}

export interface RatingScaleInput {
  id?: string;
  name: string;
  description?: string | null;
  kind: RatingScaleKind;
  levels: RatingScaleLevel[];
  allowDecimals: boolean;
  commentRequired: boolean;
  evidenceRequired: boolean;
  showNumericToEmployee: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

/** Create or update a rating scale (HR / admin only). */
export async function saveRatingScale(input: RatingScaleInput): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage rating scales." };
  if (!input.name?.trim()) return { ok: false, error: "Give the scale a name." };
  const kind = RATING_SCALE_KINDS.includes(input.kind) ? input.kind : "performance";
  const levels = cleanLevels(input.levels);
  if (levels.length < 2) return { ok: false, error: "A scale needs at least two levels." };

  const supabase = createClient();
  const fields = {
    name: input.name.trim(),
    description: input.description?.toString().trim() || null,
    kind,
    levels,
    allow_decimals: !!input.allowDecimals,
    comment_required: !!input.commentRequired,
    evidence_required: !!input.evidenceRequired,
    show_numeric_to_employee: !!input.showNumericToEmployee,
    effective_from: input.effectiveFrom || null,
    effective_to: input.effectiveTo || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from("rating_scales").update(fields).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (!tenant) return { ok: false, error: "No tenant in scope." };
    const { error } = await supabase
      .from("rating_scales")
      .insert({ ...fields, tenant_id: tenant.id });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/performance/settings/scales");
  return { ok: true };
}

/** Publish a draft scale: stamp who/when and mark it live. */
export async function publishRatingScale(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage rating scales." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("rating_scales")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by: user?.id ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/scales");
  return { ok: true };
}

/**
 * Start a new version of a scale: copies it as a draft with version+1, leaving
 * the published one untouched so historical cycles keep their definition.
 */
export async function newScaleVersion(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage rating scales." };
  const supabase = createClient();
  const { data: src } = await supabase.from("rating_scales").select("*").eq("id", id).maybeSingle();
  if (!src) return { ok: false, error: "Scale not found." };
  const s = src as Record<string, unknown>;
  const { error } = await supabase.from("rating_scales").insert({
    tenant_id: s.tenant_id,
    name: s.name,
    description: s.description,
    kind: s.kind,
    levels: s.levels,
    allow_decimals: s.allow_decimals,
    comment_required: s.comment_required,
    evidence_required: s.evidence_required,
    show_numeric_to_employee: s.show_numeric_to_employee,
    is_default: false,
    is_active: false,
    version: Number(s.version ?? 1) + 1,
    status: "draft",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/scales");
  return { ok: true };
}

/** Delete a rating scale. */
export async function deleteRatingScale(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage rating scales." };
  const supabase = createClient();
  const { error } = await supabase.from("rating_scales").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/scales");
  return { ok: true };
}

/** Make a scale the default for its kind (clears the previous default first). */
export async function setDefaultScale(id: string, kind: RatingScaleKind): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage rating scales." };
  const supabase = createClient();
  // One default per (tenant, kind): clear the current default before setting.
  const { error: clearErr } = await supabase
    .from("rating_scales")
    .update({ is_default: false })
    .eq("kind", kind)
    .eq("is_default", true);
  if (clearErr) return { ok: false, error: clearErr.message };
  const { error } = await supabase
    .from("rating_scales")
    .update({ is_default: true, is_active: true })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/scales");
  return { ok: true };
}
