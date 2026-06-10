"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function createTransportRequest(input: {
  pickup: string;
  dropoff: string;
  departAt: string;
  passengers: number;
  purpose?: string;
}): Promise<ActionResult> {
  if (!input.pickup.trim() || !input.dropoff.trim())
    return { ok: false, error: "Pickup and drop-off are required." };
  if (!input.departAt) return { ok: false, error: "Departure time is required." };

  const supabase = createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("transport_requests").insert({
    tenant_id: tenant.id,
    pickup: input.pickup.trim(),
    dropoff: input.dropoff.trim(),
    depart_at: new Date(input.departAt).toISOString(),
    passengers: Math.max(1, Math.floor(input.passengers || 1)),
    purpose: input.purpose?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transportation");
  return { ok: true };
}

export async function cancelTransportRequest(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transportation");
  return { ok: true };
}

export async function assignTransport(
  id: string,
  driverId: string | null,
  vehicleId: string | null,
): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole()))
    return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({
      driver_id: driverId,
      vehicle_id: vehicleId,
      status: driverId && vehicleId ? "assigned" : "pending",
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transportation");
  return { ok: true };
}

export async function setTransportStatus(
  id: string,
  status: "in_progress" | "completed",
): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole()))
    return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("transport_requests")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transportation");
  return { ok: true };
}
