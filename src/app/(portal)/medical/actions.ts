"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
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
  revalidatePath("/medical");
  return { ok: true };
}
