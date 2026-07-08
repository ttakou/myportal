"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notifyUsers } from "@/lib/notify";
import { getOnSite } from "@/lib/visitors";
import type { Visitor } from "@/types/visitors";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

/**
 * Everyone currently on site for the muster list — single-day visitors checked
 * in today plus long-stay passes with an open gate entry. Called by the live
 * muster on each realtime tick (a plain query cannot express that union).
 */
export async function getMusterVisitors(date: string): Promise<Visitor[]> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return [];
  return getOnSite(date);
}

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
  /**
   * Optional end date for a multi-day pass. When set (and after visitDate), the
   * visitor may check in and out repeatedly across [visitDate, visitUntil].
   */
  visitUntil?: string | null;
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
  // A pass end date is optional. When supplied it must be a valid date on/after
  // the start; equal to the start collapses back to a single-day visit (null).
  let visitUntil: string | null = null;
  const rawUntil = input.visitUntil?.trim();
  if (rawUntil) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) {
      return { ok: false, error: "Invalid end date." };
    }
    if (rawUntil < input.visitDate) {
      return { ok: false, error: "The end date must be on or after the start date." };
    }
    if (rawUntil > input.visitDate) visitUntil = rawUntil;
  }
  const isPass = visitUntil !== null;
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
    visit_until: visitUntil,
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
  // Walk-in: create already on site. A single-day visit records arrival on the
  // row itself; a pass records it as its first gate entry (below).
  if (input.checkInNow && !isPass) {
    row.status = "checked_in";
    row.check_in_at = new Date().toISOString();
  }
  const { data: inserted, error } = await supabase
    .from("visitors")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  // A pass walk-in opens its first entry in the log rather than flipping a status.
  if (input.checkInNow && isPass && inserted?.id) {
    const { error: entryErr } = await supabase.from("visitor_checkins").insert({
      tenant_id: tenant.id,
      visitor_id: inserted.id,
      check_in_at: new Date().toISOString(),
    });
    if (entryErr) return { ok: false, error: entryErr.message };
  }
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
    /** Optional free-text note from reception/security. */
    comment?: string;
  },
): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();

  const { data: visitor } = await supabase
    .from("visitors")
    .select("tenant_id, host_id, full_name, visit_until")
    .eq("id", id)
    .maybeSingle();
  if (!visitor) return { ok: false, error: "Visitor not found." };
  const isPass = visitor.visit_until != null;
  const now = new Date().toISOString();
  const minors = (n: number) => Math.max(0, Math.min(50, Math.round(Number(n) || 0)));
  const comment = opts?.comment?.trim() ? opts.comment.trim().slice(0, 500) : null;

  // Vehicle / badge / minors live on the visitor row for both kinds; only
  // overwrite a field when a value is supplied so nothing is wiped by a blank.
  const patch: Record<string, unknown> = { badge_no: opts?.badgeNo?.trim() || null };
  if (opts?.vehicleType?.trim()) patch.vehicle_type = opts.vehicleType.trim();
  if (opts?.vehiclePlate?.trim()) patch.vehicle_plate = opts.vehiclePlate.trim();
  if (opts?.infants !== undefined) patch.accompanying_infants = minors(opts.infants);
  if (opts?.children !== undefined) patch.accompanying_children = minors(opts.children);
  if (opts?.adolescents !== undefined) patch.accompanying_adolescents = minors(opts.adolescents);
  if (comment !== null) patch.check_in_comment = comment;

  if (isPass) {
    // A long-stay pass records each entry as its own row. Refuse if one is open
    // (already on site) — they must check out first.
    const { data: open } = await supabase
      .from("visitor_checkins")
      .select("id")
      .eq("visitor_id", id)
      .is("check_out_at", null)
      .limit(1)
      .maybeSingle();
    if (open) return { ok: false, error: "Visitor is already on site." };
    const { error: entryErr } = await supabase.from("visitor_checkins").insert({
      tenant_id: visitor.tenant_id,
      visitor_id: id,
      check_in_at: now,
      badge_no: opts?.badgeNo?.trim() || null,
      check_in_comment: comment,
    });
    if (entryErr) return { ok: false, error: entryErr.message };
    // Mirror the latest entry onto the row (vehicle/badge/minors + a coarse
    // status/arrival) so reports and status views degrade gracefully. The board
    // and muster derive true presence from the entry log, not this status.
    const { error: rowErr } = await supabase
      .from("visitors")
      .update({ ...patch, status: "checked_in", check_in_at: now, check_out_at: null })
      .eq("id", id);
    if (rowErr) return { ok: false, error: rowErr.message };
  } else {
    // Single-day visit: arrival is recorded on the row itself.
    const { error } = await supabase
      .from("visitors")
      .update({ ...patch, status: "checked_in", check_in_at: now })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
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

export async function checkOutVisitor(id: string, comment?: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { data: visitor } = await supabase
    .from("visitors")
    .select("tenant_id, host_id, full_name, visit_until")
    .eq("id", id)
    .maybeSingle();
  if (!visitor) return { ok: false, error: "Visitor not found." };
  const now = new Date().toISOString();
  const note = comment?.trim() ? comment.trim().slice(0, 500) : null;

  if (visitor.visit_until != null) {
    // A long-stay pass: close its currently-open entry. The pass itself stays
    // valid, so they can check in again later in the period.
    const { data: open } = await supabase
      .from("visitor_checkins")
      .select("id")
      .eq("visitor_id", id)
      .is("check_out_at", null)
      .order("check_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!open) return { ok: false, error: "Visitor is not currently on site." };
    const { error } = await supabase
      .from("visitor_checkins")
      .update({ check_out_at: now, ...(note ? { check_out_comment: note } : {}) })
      .eq("id", open.id);
    if (error) return { ok: false, error: error.message };
    // Mirror the departure onto the row for reports/status views (see check-in).
    await supabase
      .from("visitors")
      .update({ status: "checked_out", check_out_at: now, ...(note ? { check_out_comment: note } : {}) })
      .eq("id", id);
  } else {
    const { error } = await supabase
      .from("visitors")
      .update({ status: "checked_out", check_out_at: now, ...(note ? { check_out_comment: note } : {}) })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
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
