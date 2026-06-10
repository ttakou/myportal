"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}
const rev = () => revalidatePath("/offshore");
async function admin() {
  return isAdminRole(await getCurrentRole());
}

export async function requestOffshoreTrip(input: {
  installationId: string;
  mobilizeDate: string;
  demobDate?: string;
}): Promise<ActionResult> {
  if (!input.mobilizeDate) return { ok: false, error: "Mobilise date is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("offshore_trips").insert({
    tenant_id: tenant.id,
    installation_id: input.installationId || null,
    mobilize_date: input.mobilizeDate,
    demob_date: input.demobDate || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function clearHse(id: string): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("offshore_trips")
    .update({
      status: "hse_cleared",
      hse_cleared_at: new Date().toISOString(),
      hse_cleared_by: user?.id ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function assignManifest(
  id: string,
  flightId: string | null,
  bedNo: string | null,
): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_trips")
    .update({ flight_id: flightId, bed_no: bedNo, status: "manifested" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function setOffshoreStatus(
  id: string,
  status: "onboard" | "demobilised" | "cancelled",
): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_trips").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function addFlight(input: {
  flightDate: string;
  route: string;
  seats: number;
}): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  if (!input.route.trim() || !input.flightDate)
    return { ok: false, error: "Route and date are required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("helicopter_flights").insert({
    tenant_id: tenant.id,
    flight_date: input.flightDate,
    route: input.route.trim(),
    seats: Math.max(1, Math.floor(input.seats || 12)),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
