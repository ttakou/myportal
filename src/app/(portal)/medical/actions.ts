"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notifyUsers } from "@/lib/notify";
import type { FitnessStatus } from "@/types/medical";
import {
  planCampaign,
  type CampaignParams,
  type PlanCandidate,
  type PlannedRow,
} from "@/lib/medical-planner";
import { getCampaignCandidates, getCandidateInfo } from "@/lib/medical-planner-data";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

/** Resolve the caller's tenant id (RLS returns only their tenant). */
async function callerTenantId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

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

/**
 * Record the fitness-to-work result straight from a scheduled exam: writes the
 * medical_records outcome for the schedule's employee AND marks the exam cycle
 * (both visits) complete, in one step. Admin / medical-officer only.
 */
export async function recordMedicalResult(input: {
  scheduleId: string;
  fitnessStatus: FitnessStatus;
  examDate: string;
  expiryDate?: string;
  restrictions?: string;
  notes?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("medical", "create");
  if (gate) return gate;

  const supabase = createClient();
  const { data: sched } = await supabase
    .from("medical_schedules")
    .select("profile_id, tenant_id")
    .eq("id", input.scheduleId)
    .maybeSingle();
  if (!sched) return { ok: false, error: "Schedule not found." };

  const { error } = await supabase.from("medical_records").insert({
    tenant_id: sched.tenant_id,
    profile_id: sched.profile_id,
    fitness_status: input.fitnessStatus,
    exam_date: input.examDate || new Date().toISOString().slice(0, 10),
    expiry_date: input.expiryDate || null,
    restrictions: input.restrictions?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  // The exam cycle produced a result, so mark both scheduled visits complete.
  await supabase.rpc("mark_medical_visit", { p_schedule_id: input.scheduleId, p_visit: 1, p_completed: true });
  await supabase.rpc("mark_medical_visit", { p_schedule_id: input.scheduleId, p_visit: 2, p_completed: true });

  await notifyUsers({
    tenantId: sched.tenant_id as string,
    profileIds: [sched.profile_id as string],
    category: "approval",
    title: "Fitness-to-work result recorded",
    body: "Your medical assessment result has been recorded.",
    url: "/medical",
  });

  revalidatePath("/medical");
  revalidatePath("/dashboard");
  return { ok: true };
}

/* --- Annual medical campaign planner ------------------------------------- */

export type GenerateCampaignResult =
  | { ok: true; rows: PlannedRow[]; candidates: PlanCandidate[] }
  | { ok: false; error: string };

/**
 * Generate a proposed campaign schedule (admin / medical officer). Returns the
 * per-person proposal plus each candidate's rotation + training-busy info, so
 * the review UI can re-validate manual edits without another round-trip.
 */
export async function generateMedicalCampaign(
  params: CampaignParams,
): Promise<GenerateCampaignResult> {
  const gate = await requireModule("medical", "create");
  if (gate) return { ok: false, error: gate.error ?? "Not authorized." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
    return { ok: false, error: "Invalid start or end date." };
  }
  if (params.endDate < params.startDate) return { ok: false, error: "End date is before start date." };
  if (!(params.capacityPerDay >= 1)) return { ok: false, error: "Capacity per day must be at least 1." };

  const tenantId = await callerTenantId();
  if (!tenantId) return { ok: false, error: "No tenant in scope." };

  const candidates = await getCampaignCandidates(tenantId);
  const rows = planCampaign(params, candidates);
  return { ok: true, rows, candidates };
}

/** Look up a manually-added staff member's rotation + training-busy info. */
export async function lookupCampaignCandidate(
  profileId: string,
): Promise<{ ok: true; candidate: PlanCandidate } | { ok: false; error: string }> {
  const gate = await requireModule("medical", "create");
  if (gate) return { ok: false, error: gate.error ?? "Not authorized." };
  const tenantId = await callerTenantId();
  if (!tenantId) return { ok: false, error: "No tenant in scope." };
  const candidate = await getCandidateInfo(tenantId, profileId);
  if (!candidate) return { ok: false, error: "Employee not found." };
  return { ok: true, candidate };
}

/** Commit the (possibly edited) campaign proposal into medical_schedules. */
export async function commitMedicalCampaign(input: {
  year: number;
  rows: { profileId: string; visit1: string; visit2: string | null; examIndicators?: string | null; workLocation?: string | null }[];
}): Promise<ActionResult> {
  const gate = await requireModule("medical", "create");
  if (gate) return gate;
  const tenantId = await callerTenantId();
  if (!tenantId) return { ok: false, error: "No tenant in scope." };

  const rows = input.rows.filter((r) => r.profileId && r.visit1);
  if (rows.length === 0) return { ok: false, error: "Nothing to schedule." };

  const supabase = createClient();
  const { error } = await supabase.from("medical_schedules").upsert(
    rows.map((r) => ({
      tenant_id: tenantId,
      profile_id: r.profileId,
      year: input.year,
      visit1_date: r.visit1,
      visit1_time: "08:30 AM",
      visit2_date: r.visit2 || null,
      visit2_time: r.visit2 ? "02:30 PM" : null,
      exam_indicators: r.examIndicators?.trim() || null,
      work_location: r.workLocation || null,
    })),
    { onConflict: "tenant_id,profile_id,year" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/medical");
  revalidatePath("/dashboard");
  return { ok: true };
}
