"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notifyUsers } from "@/lib/notify";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

function revalidate() {
  revalidatePath("/visitors");
  revalidatePath("/visitors/muster");
}

export type HostOption = { id: string; name: string; department: string | null };

/** Typeahead for assigning a visit to an individual host (employee directory). */
export async function searchHosts(query: string): Promise<HostOption[]> {
  const gate = await requireModule("visitors", "create");
  if (gate) return [];
  const q = query.trim().replace(/[%_,()]/g, " ").trim();
  if (q.length < 2) return [];
  const supabase = createClient();
  const like = `%${q}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, department")
    .eq("is_active", true)
    .ilike("full_name", like)
    .order("full_name")
    .limit(8);
  if (error) return [];
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? "(no name)",
    department: (p.department as string | null) ?? null,
  }));
}

export async function preRegisterVisitor(input: {
  fullName: string;
  company?: string;
  purpose?: string;
  visitDate: string;
  vehicleType?: string;
  vehiclePlate?: string;
  infants?: number;
  children?: number;
  adolescents?: number;
  /** Assign the visit to an individual host (employee id). */
  hostId?: string | null;
  /** Assign the visit to a department / service. */
  service?: string | null;
  /** Walk-in: create the visitor already checked in (on site). */
  checkInNow?: boolean;
}): Promise<ActionResult> {
  // A walk-in check-in needs reception/operate rights; a plain pre-registration
  // only needs create.
  const gate = await requireModule("visitors", input.checkInNow ? "operate" : "create");
  if (gate) return gate;
  if (!input.fullName.trim()) return { ok: false, error: "Visitor name is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visitDate)) {
    return { ok: false, error: "Invalid visit date." };
  }
  const minors = (n: number | undefined) => Math.max(0, Math.min(50, Math.round(Number(n) || 0)));
  const supabase = createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const row: Record<string, unknown> = {
    tenant_id: tenant.id,
    full_name: input.fullName.trim(),
    company: input.company?.trim() || null,
    purpose: input.purpose?.trim() || null,
    visit_date: input.visitDate,
    vehicle_type: input.vehicleType?.trim() || null,
    vehicle_plate: input.vehiclePlate?.trim() || null,
    service: input.service?.trim() || null,
    accompanying_infants: minors(input.infants),
    accompanying_children: minors(input.children),
    accompanying_adolescents: minors(input.adolescents),
  };
  // Assign to an individual host when picked (else the column default / RLS
  // sets the registering user). RLS still applies: a non-admin may only host
  // their own visitors.
  if (input.hostId) row.host_id = input.hostId;
  // Walk-in: create already on site.
  if (input.checkInNow) {
    row.status = "checked_in";
    row.check_in_at = new Date().toISOString();
  }
  const { error } = await supabase.from("visitors").insert(row);
  if (error) return { ok: false, error: error.message };
  if (input.hostId) {
    await notifyUsers({
      tenantId: tenant.id as string,
      profileIds: [input.hostId],
      category: "general",
      title: "Visitor pre-registered",
      body: "A visitor has been pre-registered with you as host.",
      url: "/visitors",
    });
  }
  revalidate();
  return { ok: true };
}

export async function checkInVisitor(
  id: string,
  opts?: {
    badgeNo?: string;
    vehicleType?: string;
    vehiclePlate?: string;
    infants?: number;
    children?: number;
    adolescents?: number;
  },
): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();

  const { data: visitor } = await supabase
    .from("visitors")
    .select("tenant_id, host_id, full_name")
    .eq("id", id)
    .maybeSingle();

  // Records the arrival time. Vehicle type/plate are only overwritten when
  // provided at check-in, so a pre-registered plate is never wiped by a blank.
  const patch: Record<string, unknown> = {
    status: "checked_in",
    check_in_at: new Date().toISOString(),
    badge_no: opts?.badgeNo?.trim() || null,
  };
  if (opts?.vehicleType?.trim()) patch.vehicle_type = opts.vehicleType.trim();
  if (opts?.vehiclePlate?.trim()) patch.vehicle_plate = opts.vehiclePlate.trim();

  // Accompanying minors are frequently unknown until arrival, so reception can
  // set/adjust the headcount at check-in. Only overwrite a band when a value is
  // supplied, so a pre-registered count is never wiped by an omitted field.
  const minors = (n: number) => Math.max(0, Math.min(50, Math.round(Number(n) || 0)));
  if (opts?.infants !== undefined) patch.accompanying_infants = minors(opts.infants);
  if (opts?.children !== undefined) patch.accompanying_children = minors(opts.children);
  if (opts?.adolescents !== undefined) patch.accompanying_adolescents = minors(opts.adolescents);

  const { error } = await supabase.from("visitors").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (visitor?.host_id) {
    const name = (visitor.full_name as string | null)?.trim();
    await notifyUsers({
      tenantId: visitor.tenant_id as string,
      profileIds: [visitor.host_id as string],
      category: "general",
      title: "Your visitor checked in",
      body: name ? `${name} has arrived on site.` : "Your visitor has arrived on site.",
      url: "/visitors",
    });
  }
  revalidate();
  return { ok: true };
}

/**
 * Correct the accompanying-minor headcount on an existing visitor record — e.g.
 * fixing an infant count on a pre-registration before arrival. Reception / host
 * with edit rights (admins bypass).
 */
export async function updateVisitorMinors(
  id: string,
  counts: { infants?: number; children?: number; adolescents?: number },
): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const clamp = (n: number | undefined) => Math.max(0, Math.min(50, Math.round(Number(n) || 0)));
  const supabase = createClient();
  const { error } = await supabase
    .from("visitors")
    .update({
      accompanying_infants: clamp(counts.infants),
      accompanying_children: clamp(counts.children),
      accompanying_adolescents: clamp(counts.adolescents),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function checkOutVisitor(id: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { data: visitor } = await supabase
    .from("visitors")
    .select("tenant_id, host_id, full_name")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase
    .from("visitors")
    .update({ status: "checked_out", check_out_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (visitor?.host_id) {
    const name = (visitor.full_name as string | null)?.trim();
    await notifyUsers({
      tenantId: visitor.tenant_id as string,
      profileIds: [visitor.host_id as string],
      category: "general",
      title: "Your visitor checked out",
      body: name ? `${name} has departed.` : "Your visitor has departed.",
      url: "/visitors",
    });
  }
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
