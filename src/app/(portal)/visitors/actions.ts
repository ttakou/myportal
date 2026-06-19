"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

function revalidate() {
  revalidatePath("/visitors");
  revalidatePath("/visitors/muster");
}

export async function preRegisterVisitor(input: {
  fullName: string;
  company?: string;
  purpose?: string;
  visitDate: string;
  vehicleType?: string;
  vehiclePlate?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("visitors", "create");
  if (gate) return gate;
  if (!input.fullName.trim()) return { ok: false, error: "Visitor name is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visitDate)) {
    return { ok: false, error: "Invalid visit date." };
  }
  const supabase = createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("visitors").insert({
    tenant_id: tenant.id,
    full_name: input.fullName.trim(),
    company: input.company?.trim() || null,
    purpose: input.purpose?.trim() || null,
    visit_date: input.visitDate,
    vehicle_type: input.vehicleType?.trim() || null,
    vehicle_plate: input.vehiclePlate?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function checkInVisitor(
  id: string,
  opts?: { badgeNo?: string; vehicleType?: string; vehiclePlate?: string },
): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();

  // Records the arrival time. Vehicle type/plate are only overwritten when
  // provided at check-in, so a pre-registered plate is never wiped by a blank.
  const patch: Record<string, unknown> = {
    status: "checked_in",
    check_in_at: new Date().toISOString(),
    badge_no: opts?.badgeNo?.trim() || null,
  };
  if (opts?.vehicleType?.trim()) patch.vehicle_type = opts.vehicleType.trim();
  if (opts?.vehiclePlate?.trim()) patch.vehicle_plate = opts.vehiclePlate.trim();

  const { error } = await supabase.from("visitors").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function checkOutVisitor(id: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("visitors")
    .update({ status: "checked_out", check_out_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function cancelVisitor(id: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "edit");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("visitors")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
