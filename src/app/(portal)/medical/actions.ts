"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import type { FitnessStatus } from "@/types/medical";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function recordMedical(input: {
  profileId: string;
  fitnessStatus: FitnessStatus;
  examDate: string;
  expiryDate?: string;
  restrictions?: string;
  notes?: string;
}): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole()))
    return { ok: false, error: "Only medical officers can record fitness." };
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
