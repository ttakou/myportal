"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { IssueType } from "@/types/feedback";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function submitFeedback(input: {
  foodQuality?: number | null;
  quantityRating?: number | null;
  issueType: IssueType;
  comment?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const hasRating = input.foodQuality || input.quantityRating;
  if (!hasRating && input.issueType === "none" && !input.comment?.trim()) {
    return { ok: false, error: "Add a rating, an issue, or a comment." };
  }

  const { error } = await supabase.from("canteen_feedback").insert({
    tenant_id: tenant.id,
    food_quality: input.foodQuality || null,
    quantity_rating: input.quantityRating || null,
    issue_type: input.issueType,
    comment: input.comment?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/feedback");
  return { ok: true };
}

export async function resolveFeedback(id: string, resolved: boolean): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("canteen_feedback")
    .update({
      status: resolved ? "resolved" : "open",
      resolved_by: resolved ? user?.id ?? null : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/canteen/feedback");
  return { ok: true };
}
