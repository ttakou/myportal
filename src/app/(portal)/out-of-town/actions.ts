"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function rev() {
  revalidatePath("/out-of-town");
}

export async function createTrip(input: {
  destination: string;
  purpose?: string;
  departDate: string;
  returnDate?: string;
  estimatedCost: number;
}): Promise<ActionResult> {
  if (!input.destination.trim()) return { ok: false, error: "Destination is required." };
  if (!input.departDate) return { ok: false, error: "Departure date is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("out_of_town_trips").insert({
    tenant_id: tenant.id,
    destination: input.destination.trim(),
    purpose: input.purpose?.trim() || null,
    depart_date: input.departDate,
    return_date: input.returnDate || null,
    estimated_cost: Math.max(0, input.estimatedCost || 0),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function submitTrip(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("out_of_town_trips")
    .update({ status: "submitted" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function managerApproveTrip(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("out_of_town_trips")
    .update({
      status: "manager_approved",
      manager_approved_by: user?.id ?? null,
      manager_approved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function financeApproveTrip(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("out_of_town_trips")
    .update({
      status: "finance_approved",
      finance_approved_by: user?.id ?? null,
      finance_approved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function rejectTrip(id: string, reason: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("out_of_town_trips")
    .update({ status: "rejected", rejection_reason: reason.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function addTripExpense(input: {
  tripId: string;
  category: string;
  amount: number;
  note?: string;
}): Promise<ActionResult> {
  if (!input.category.trim()) return { ok: false, error: "Category is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("trip_expenses").insert({
    tenant_id: tenant.id,
    trip_id: input.tripId,
    category: input.category.trim(),
    amount: Math.max(0, input.amount || 0),
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
