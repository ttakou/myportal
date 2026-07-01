"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notifyUsers } from "@/lib/notify";
import type { FitnessStatus } from "@/types/medical";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

export async function recordMedical(input: {
  profileId: string;
  fitnessStatus: FitnessStatus;
  examDate: string;
  expiryDate?: string;
  restrictions?: string;
  notes?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("medical", "create");
  if (gate) return gate;
  if (!input.profileId) return { ok: false, error: "Select an employee." };

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("medical_records").insert({
    tenant_id: tenant.id,
    profile_id: input.profileId,
    fitness_status: input.fitnessStatus,
    exam_date: input.examDate || new Date().toISOString().slice(0, 10),
    expiry_date: input.expiryDate || null,
    restrictions: input.restrictions?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await notifyUsers({
    tenantId: tenant.id,
    profileIds: [input.profileId],
    category: "approval",
    title: "Medical assessment recorded",
    body: "Your fitness-to-work assessment has been recorded.",
    url: "/medical",
  });

  revalidatePath("/medical");
  return { ok: true };
}

/**
 * Mark a scheduled medical visit (1 or 2) complete or not. Allowed for the
 * employee on their own schedule, or a tenant/system admin — enforced inside the
 * `mark_medical_visit` SECURITY DEFINER function (which only touches the
 * completion columns).
 */
export async function setMedicalVisitComplete(
  scheduleId: string,
  visit: 1 | 2,
  completed: boolean,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_medical_visit", {
    p_schedule_id: scheduleId,
    p_visit: visit,
    p_completed: completed,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/medical");
  revalidatePath("/dashboard");
  return { ok: true };
}
