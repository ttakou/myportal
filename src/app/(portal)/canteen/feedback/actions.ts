"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notifyUsers } from "@/lib/notify";
import type { IssueType } from "@/types/feedback";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

export async function submitFeedback(input: {
  foodQuality?: number | null;
  quantityRating?: number | null;
  issueType: IssueType;
  comment?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("canteen", "create");
  if (gate) return gate;
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

  const { data: managers } = await supabase
    .from("profile_roles")
    .select("profile_id")
    .eq("tenant_id", tenant.id)
    .eq("role", "canteen_manager");
  await notifyUsers({
    tenantId: tenant.id,
    profileIds: (managers ?? []).map((m) => m.profile_id),
    category: "general",
    title: "New canteen feedback",
    body: "An employee submitted feedback about meal service.",
    url: "/canteen/feedback",
  });

  revalidatePath("/canteen/feedback");
  return { ok: true };
}

export async function resolveFeedback(id: string, resolved: boolean): Promise<ActionResult> {
  const gate = await requireModule("canteen", "approve", (a) => a.isCanteenManager);
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: feedback } = await supabase
    .from("canteen_feedback")
    .select("tenant_id, profile_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase
    .from("canteen_feedback")
    .update({
      status: resolved ? "resolved" : "open",
      resolved_by: resolved ? user?.id ?? null : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (resolved && feedback?.tenant_id) {
    await notifyUsers({
      tenantId: feedback.tenant_id,
      profileIds: [feedback.profile_id],
      category: "general",
      title: "Your canteen feedback was resolved",
      body: "We've reviewed and resolved your feedback. Thank you.",
      url: "/canteen/feedback",
    });
  }

  revalidatePath("/canteen/feedback");
  return { ok: true };
}
