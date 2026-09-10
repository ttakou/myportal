"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notifyUsers } from "@/lib/notify";
import { getDirectory, getOnSite } from "@/lib/visitors";
import { createAdminClient } from "@/lib/supabase/admin";
import { holdersOfVerb } from "@/lib/verb-holders";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { matchDirectory } from "@/lib/visitors/directory";
import { parseGroupMembers } from "@/lib/visitors/group";
import { parseBadgeNumbers } from "@/lib/visitors/badges";
import { cancelVisitorRides, createVisitorRide, hasTransportationModule } from "@/lib/visitors-transport";
import type { DirectoryEntry, Visitor } from "@/types/visitors";

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

/**
 * Resolve an optional operator-supplied arrival time (ISO) to a timestamp.
 * Empty → now. Rejects unparseable values and times more than 5 min in the
 * future (arrival can't be ahead of the clock).
 */
function parseArrivalTime(iso?: string): { iso: string; error?: string } {
  if (!iso || !iso.trim()) return { iso: new Date().toISOString() };
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { iso: "", error: "Invalid arrival time." };
  if (t > Date.now() + 5 * 60000) return { iso: "", error: "Arrival time can't be in the future." };
  return { iso: new Date(t).toISOString() };
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

/**
 * The directory record a registration belongs to — found on ID number,
 * phone, or name and company; created when there is none; refused when
 * the person is flagged do-not-admit. Returns the record id.
 */
async function resolveDirectory(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  input: { full_name: string; company: string | null; id_document_type: string | null; id_document_number: string | null; email: string | null; phone: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.full_name.trim();
  const orParts = [`full_name.ilike.${name.replace(/[%_,()]/g, " ")}`];
  if (input.id_document_number) orParts.push(`id_document_number.ilike.${input.id_document_number.replace(/[%_,()]/g, " ")}`);
  if (input.phone) orParts.push(`phone.ilike.%${input.phone.replace(/\D/g, "").slice(-8)}%`);
  const { data: candidates } = await supabase
    .from("visitor_directory")
    .select("id, full_name, company, id_document_number, phone, do_not_admit, do_not_admit_reason")
    .or(orParts.join(","))
    .limit(50);
  const hit = matchDirectory(input, (candidates ?? []) as (DirectoryEntry & { id: string })[]);
  if (hit) {
    if (hit.do_not_admit) {
      return { ok: false, error: `Do not admit: ${hit.full_name}${hit.do_not_admit_reason ? ` — ${hit.do_not_admit_reason}` : ""}. Ask security before going further.` };
    }
    // Keep the record current with whatever is new on this visit.
    const patch: Record<string, string> = {};
    if (input.company && !hit.company) patch.company = input.company;
    if (input.id_document_number && !hit.id_document_number) {
      patch.id_document_number = input.id_document_number;
      if (input.id_document_type) patch.id_document_type = input.id_document_type;
    }
    if (input.phone && !hit.phone) patch.phone = input.phone;
    if (input.email) patch.email = input.email;
    if (Object.keys(patch).length) await supabase.from("visitor_directory").update(patch).eq("id", hit.id);
    return { ok: true, id: hit.id };
  }
  const { data: created, error } = await supabase
    .from("visitor_directory")
    .insert({ tenant_id: tenantId, ...input, full_name: name })
    .select("id")
    .maybeSingle();
  if (error || !created) return { ok: false, error: error?.message ?? "Could not record the visitor." };
  return { ok: true, id: created.id as string };
}

/** Typeahead over the visitor directory for the pre-registration form. */
export async function searchVisitorDirectory(query: string): Promise<DirectoryEntry[]> {
  const gate = await requireModule("visitors", "create");
  if (gate) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  return getDirectory(q, 8);
}

/** Flag or clear a person in the directory. Security and admins only. */
export async function setDoNotAdmit(id: string, flag: boolean, reason?: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("visitor_directory")
    .update(
      flag
        ? { do_not_admit: true, do_not_admit_reason: reason?.trim() || null, do_not_admit_by: user?.id ?? null, do_not_admit_at: new Date().toISOString() }
        : { do_not_admit: false, do_not_admit_reason: null, do_not_admit_by: null, do_not_admit_at: null },
    )
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/visitors/directory");
  revalidate();
  return { ok: true };
}

/** A note on a directory record (what they usually come for, who to call). */
export async function setDirectoryNotes(id: string, notes: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("visitor_directory").update({ notes: notes.trim() || null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/visitors/directory");
  return { ok: true };
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
  /** Identity document (CNI / passport / other) + its number. */
  idType?: string;
  idNumber?: string;
  /** Visitor contact details (optional). */
  email?: string;
  phone?: string;
  /** Walk-in: create the visitor already checked in (on site). */
  checkInNow?: boolean;
  /** Flights: an airport pickup on arrival, a drop-off for the departure (site clock). */
  arrivalFlight?: string;
  arrivalAt?: string;
  departureFlight?: string;
  departureAt?: string;
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
    id_document_type: input.idType?.trim() || null,
    id_document_number: input.idNumber?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    accompanying_infants: minors(input.infants),
    accompanying_children: minors(input.children),
    accompanying_adolescents: minors(input.adolescents),
  };
  // Assign to an individual host when picked (else the column default / RLS
  // sets the registering user). RLS still applies: a non-admin may only host
  // their own visitors.
  if (input.hostId) row.host_id = input.hostId;
  // The person behind the visit: matched or created in the directory, and
  // refused outright when flagged.
  const dir = await resolveDirectory(supabase, tenant.id as string, {
    full_name: row.full_name as string,
    company: row.company as string | null,
    id_document_type: row.id_document_type as string | null,
    id_document_number: row.id_document_number as string | null,
    email: row.email as string | null,
    phone: row.phone as string | null,
  });
  if (!dir.ok) return { ok: false, error: dir.error };
  row.directory_id = dir.id;
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
  if (inserted?.id) {
    const rides = await raiseRides(supabase, tenant.id as string, [inserted.id as string], {
      name: row.full_name as string,
      company: row.company as string | null,
      passengers: 1,
      arrivalFlight: input.arrivalFlight,
      arrivalAt: input.arrivalAt,
      departureFlight: input.departureFlight,
      departureAt: input.departureAt,
    });
    if (!rides.ok) return { ok: false, error: `Visitor saved, but the airport ride failed: ${rides.error}` };
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

/**
 * The airport rides a registration asks for, raised on the transport board
 * when the tenant runs that module, and linked to every visitor row given
 * (one ride for a whole group).
 */
async function raiseRides(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  visitorIds: string[],
  v: { name: string; company: string | null; passengers: number; arrivalFlight?: string; arrivalAt?: string; departureFlight?: string; departureAt?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const wantsPickup = Boolean(v.arrivalAt?.trim());
  const wantsDropoff = Boolean(v.departureAt?.trim());
  const patch: Record<string, string | null> = {};
  if (v.arrivalFlight?.trim()) patch.flight_arrival = v.arrivalFlight.trim();
  if (v.departureFlight?.trim()) patch.flight_departure = v.departureFlight.trim();
  if ((wantsPickup || wantsDropoff) && (await hasTransportationModule(supabase))) {
    if (wantsPickup) {
      const r = await createVisitorRide(supabase, { tenantId, kind: "pickup", when: v.arrivalAt as string, visitorName: v.name, company: v.company, flight: v.arrivalFlight?.trim() || null, passengers: v.passengers });
      if (!r.ok) return r;
      patch.pickup_request_id = r.id;
    }
    if (wantsDropoff) {
      const r = await createVisitorRide(supabase, { tenantId, kind: "dropoff", when: v.departureAt as string, visitorName: v.name, company: v.company, flight: v.departureFlight?.trim() || null, passengers: v.passengers });
      if (!r.ok) return r;
      patch.dropoff_request_id = r.id;
    }
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("visitors").update(patch).in("id", visitorIds);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * A delegation on one form: company, host, purpose, dates and vehicle are
 * shared; the people come one per line. Every member is matched to the
 * directory first — a flagged person stops the whole group before anything
 * is written — then each becomes an ordinary visitor row under one group
 * id. The host hears once.
 */
export async function preRegisterGroup(input: {
  members: string;
  company?: string;
  purpose?: string;
  visitDate: string;
  visitUntil?: string | null;
  vehicleType?: string;
  vehiclePlate?: string;
  hostId?: string | null;
  service?: string | null;
  checkInNow?: boolean;
  arrivalFlight?: string;
  arrivalAt?: string;
  departureFlight?: string;
  departureAt?: string;
}): Promise<ActionResult & { created?: number }> {
  const gate = await requireModule("visitors", input.checkInNow ? "operate" : "create");
  if (gate) return gate;
  const members = parseGroupMembers(input.members);
  if (members.length === 0) return { ok: false, error: "List the people, one per line." };
  if (members.length > 60) return { ok: false, error: "A group is at most 60 people; split it." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visitDate)) return { ok: false, error: "Invalid visit date." };
  let visitUntil: string | null = null;
  const rawUntil = input.visitUntil?.trim();
  if (rawUntil) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawUntil)) return { ok: false, error: "Invalid end date." };
    if (rawUntil < input.visitDate) return { ok: false, error: "The end date must be on or after the start date." };
    if (rawUntil > input.visitDate) visitUntil = rawUntil;
  }
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const company = input.company?.trim() || null;

  // Directory first, for everyone: one flagged person stops the group.
  const directoryIds: string[] = [];
  for (const m of members) {
    const dir = await resolveDirectory(supabase, tenant.id as string, {
      full_name: m.full_name,
      company,
      id_document_type: m.id_document_number ? "other" : null,
      id_document_number: m.id_document_number,
      email: null,
      phone: m.phone,
    });
    if (!dir.ok) return { ok: false, error: dir.error };
    directoryIds.push(dir.id);
  }

  const groupId = crypto.randomUUID();
  const now = new Date().toISOString();
  const walkIn = Boolean(input.checkInNow) && visitUntil === null;
  const rows = members.map((m, i) => ({
    tenant_id: tenant.id,
    group_id: groupId,
    directory_id: directoryIds[i],
    full_name: m.full_name,
    company,
    purpose: input.purpose?.trim() || null,
    visit_date: input.visitDate,
    visit_until: visitUntil,
    vehicle_type: input.vehicleType?.trim() || null,
    vehicle_plate: input.vehiclePlate?.trim() || null,
    service: input.service?.trim() || null,
    id_document_type: m.id_document_number ? "other" : null,
    id_document_number: m.id_document_number,
    phone: m.phone,
    ...(input.hostId ? { host_id: input.hostId } : {}),
    ...(walkIn ? { status: "checked_in", check_in_at: now } : {}),
  }));
  const { data: inserted, error } = await supabase.from("visitors").insert(rows).select("id");
  if (error) return { ok: false, error: error.message };
  if (input.checkInNow && visitUntil !== null) {
    const { error: entryErr } = await supabase
      .from("visitor_checkins")
      .insert((inserted ?? []).map((r) => ({ tenant_id: tenant.id, visitor_id: r.id, check_in_at: now })));
    if (entryErr) return { ok: false, error: entryErr.message };
  }
  const rides = await raiseRides(supabase, tenant.id as string, (inserted ?? []).map((r) => r.id as string), {
    name: `${company ?? "Group"} × ${members.length}`,
    company: null,
    passengers: members.length,
    arrivalFlight: input.arrivalFlight,
    arrivalAt: input.arrivalAt,
    departureFlight: input.departureFlight,
    departureAt: input.departureAt,
  });
  if (!rides.ok) return { ok: false, error: `Group saved, but the airport ride failed: ${rides.error}` };
  if (input.hostId) {
    await notifyUsers({
      tenantId: tenant.id as string,
      profileIds: [input.hostId],
      category: "general",
      title: `Group of ${members.length} pre-registered with you as host`,
      body: `${company ? `${company} · ` : ""}${members
        .slice(0, 6)
        .map((m) => m.full_name)
        .join(", ")}${members.length > 6 ? ` and ${members.length - 6} more` : ""} on ${input.visitDate}.`,
      url: `/visitors?date=${input.visitDate}`,
    });
  }
  revalidate();
  return { ok: true, created: members.length };
}

/** Check in every member of a group still expected. Each goes through the same path as a single check-in. */
export async function checkInGroup(groupId: string, comment?: string): Promise<ActionResult & { done?: number; skipped?: string[] }> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { data } = await supabase.from("visitors").select("id, full_name, status, visit_until").eq("group_id", groupId);
  let done = 0;
  const skipped: string[] = [];
  for (const v of data ?? []) {
    if (v.status === "cancelled" || v.status === "no_show") continue;
    if (v.status === "checked_in") continue;
    const res = await checkInVisitor(v.id as string, { comment });
    if (res.ok) done += 1;
    else skipped.push(`${v.full_name}: ${res.error ?? "not checked in"}`);
  }
  revalidate();
  return { ok: true, done, skipped };
}

/** Check out every member of a group still on site. */
export async function checkOutGroup(groupId: string, comment?: string): Promise<ActionResult & { done?: number }> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { data } = await supabase.from("visitors").select("id, status").eq("group_id", groupId);
  const [open] = await Promise.all([
    supabase
      .from("visitor_checkins")
      .select("visitor_id")
      .in(
        "visitor_id",
        (data ?? []).map((v) => v.id as string),
      )
      .is("check_out_at", null),
  ]);
  const onSite = new Set([...(data ?? []).filter((v) => v.status === "checked_in").map((v) => v.id as string), ...(open.data ?? []).map((r) => r.visitor_id as string)]);
  let done = 0;
  for (const id of onSite) {
    const res = await checkOutVisitor(id, comment);
    if (res.ok) done += 1;
  }
  revalidate();
  return { ok: true, done };
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
    /** Identity document (CNI / passport / other) + its number. */
    idType?: string;
    idNumber?: string;
    /** Visitor contact details (optional). */
    email?: string;
    phone?: string;
    /** Optional free-text note from reception/security. */
    comment?: string;
    /** Arrival timestamp (ISO). Defaults to now; reception may back-date it. */
    checkInAt?: string;
  },
): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();

  const { data: visitor } = await supabase
    .from("visitors")
    .select("tenant_id, host_id, full_name, visit_until, directory:visitor_directory!visitors_directory_id_fkey(do_not_admit, do_not_admit_reason)")
    .eq("id", id)
    .maybeSingle();
  if (!visitor) return { ok: false, error: "Visitor not found." };
  const flagged = (Array.isArray(visitor.directory) ? visitor.directory[0] : visitor.directory) as { do_not_admit?: boolean; do_not_admit_reason?: string | null } | null;
  if (flagged?.do_not_admit) {
    return { ok: false, error: `Do not admit: ${visitor.full_name}${flagged.do_not_admit_reason ? ` — ${flagged.do_not_admit_reason}` : ""}. Security must clear the flag in the visitor directory first.` };
  }
  const isPass = visitor.visit_until != null;
  // Arrival defaults to now, but reception may enter/adjust it (e.g. the
  // visitor arrived earlier than they were registered at the desk).
  const arrival = parseArrivalTime(opts?.checkInAt);
  if (arrival.error) return { ok: false, error: arrival.error };
  const now = arrival.iso;
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
  if (opts?.idType?.trim()) patch.id_document_type = opts.idType.trim();
  if (opts?.idNumber?.trim()) patch.id_document_number = opts.idNumber.trim();
  if (opts?.email?.trim()) patch.email = opts.email.trim();
  if (opts?.phone?.trim()) patch.phone = opts.phone.trim();
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

/**
 * Correct the recorded check-in (arrival) time of a visitor who is already on
 * site or has departed — e.g. they arrived earlier than the desk logged them.
 * For a single-day visit this is the row's arrival; for a long-stay pass it is
 * the most recent gate entry (and the mirrored row time). Must stay before the
 * departure time when one exists.
 */
export async function setVisitorCheckInAt(id: string, checkInAt: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const parsed = parseArrivalTime(checkInAt);
  if (parsed.error) return { ok: false, error: parsed.error };
  if (!checkInAt?.trim()) return { ok: false, error: "Pick an arrival time." };
  const iso = parsed.iso;
  const supabase = createClient();
  const { data: visitor } = await supabase
    .from("visitors")
    .select("visit_until, check_in_at, check_out_at")
    .eq("id", id)
    .maybeSingle();
  if (!visitor) return { ok: false, error: "Visitor not found." };
  if (visitor.check_out_at && iso > (visitor.check_out_at as string)) {
    return { ok: false, error: "Arrival time must be before the departure time." };
  }

  if (visitor.visit_until != null) {
    // Long-stay pass: adjust the most recent gate entry, and mirror onto the row.
    const { data: entry } = await supabase
      .from("visitor_checkins")
      .select("id")
      .eq("visitor_id", id)
      .order("check_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (entry) {
      const { error } = await supabase
        .from("visitor_checkins")
        .update({ check_in_at: iso })
        .eq("id", entry.id);
      if (error) return { ok: false, error: error.message };
    }
    await supabase.from("visitors").update({ check_in_at: iso }).eq("id", id);
  } else {
    const { error } = await supabase.from("visitors").update({ check_in_at: iso }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}

/**
 * Correct the recorded check-out (departure) time of a visitor who has already
 * left — e.g. they departed before the desk logged it. For a single-day visit
 * this is the row's departure; for a long-stay pass it is the most recent gate
 * entry (and the mirrored row time). Must stay after the arrival time and not be
 * in the future.
 */
export async function setVisitorCheckOutAt(id: string, checkOutAt: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  if (!checkOutAt?.trim()) return { ok: false, error: "Pick a departure time." };
  const t = Date.parse(checkOutAt);
  if (Number.isNaN(t)) return { ok: false, error: "Invalid departure time." };
  if (t > Date.now() + 5 * 60000) return { ok: false, error: "Departure time can't be in the future." };
  const iso = new Date(t).toISOString();
  const supabase = createClient();
  const { data: visitor } = await supabase
    .from("visitors")
    .select("visit_until, check_in_at, check_out_at")
    .eq("id", id)
    .maybeSingle();
  if (!visitor) return { ok: false, error: "Visitor not found." };
  if (!visitor.check_out_at) return { ok: false, error: "This visitor has not checked out yet." };
  if (visitor.check_in_at && iso < (visitor.check_in_at as string)) {
    return { ok: false, error: "Departure time must be after the arrival time." };
  }

  if (visitor.visit_until != null) {
    // Long-stay pass: adjust the most recent gate entry, and mirror onto the row.
    const { data: entry } = await supabase
      .from("visitor_checkins")
      .select("id")
      .eq("visitor_id", id)
      .order("check_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (entry) {
      const { error } = await supabase
        .from("visitor_checkins")
        .update({ check_out_at: iso })
        .eq("id", entry.id);
      if (error) return { ok: false, error: error.message };
    }
    await supabase.from("visitors").update({ check_out_at: iso }).eq("id", id);
  } else {
    const { error } = await supabase.from("visitors").update({ check_out_at: iso }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}

export async function checkOutVisitor(id: string, comment?: string, badgeReturned?: boolean): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { data: visitor } = await supabase
    .from("visitors")
    .select("tenant_id, host_id, full_name, visit_until, badge_no, company")
    .eq("id", id)
    .maybeSingle();
  if (!visitor) return { ok: false, error: "Visitor not found." };
  const now = new Date().toISOString();
  const note = comment?.trim() ? comment.trim().slice(0, 500) : null;
  // Whether the badge came back; only asked when one was issued.
  if (visitor.badge_no && badgeReturned !== undefined) {
    await supabase.from("visitors").update({ badge_returned: badgeReturned, badge_returned_at: now }).eq("id", id);
    if (!badgeReturned) {
      const admin = createAdminClient();
      await notifyUsers({
        tenantId: visitor.tenant_id as string,
        profileIds: await holdersOfVerb(admin ?? supabase, visitor.tenant_id as string, "visitors", ["operate"]),
        category: "general",
        title: `Badge ${visitor.badge_no} not returned`,
        body: `${visitor.full_name}${visitor.company ? ` (${visitor.company})` : ""} left without handing it back.`,
        url: "/visitors",
      });
    }
  }

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
      .update({ status: "checked_out", check_out_at: now, overstay_alerted_at: null, ...(note ? { check_out_comment: note } : {}) })
      .eq("id", id);
  } else {
    const { error } = await supabase
      .from("visitors")
      .update({ status: "checked_out", check_out_at: now, overstay_alerted_at: null, ...(note ? { check_out_comment: note } : {}) })
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
  const supabase = createClient();
  // The host cancels their own visitor; anyone else needs the edit verb.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: v } = await supabase.from("visitors").select("host_id, created_by, pickup_request_id, dropoff_request_id").eq("id", id).maybeSingle();
  const mine = Boolean(user) && (v?.host_id === user?.id || v?.created_by === user?.id);
  if (!mine && !isAdminRole(await getCurrentRole())) {
    const gate = await requireModule("visitors", "edit");
    if (gate) return gate;
  }
  await cancelVisitorRides(supabase, [v?.pickup_request_id ?? null, v?.dropoff_request_id ?? null]);
  const { error } = await supabase
    .from("visitors")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

// --- Badge pool -------------------------------------------------------------

/** Add badges to the pool: a list or a range ("V001-V050"). */
export async function addBadges(text: string): Promise<ActionResult & { added?: number }> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const numbers = parseBadgeNumbers(text);
  if (numbers.length === 0) return { ok: false, error: "Type badge numbers, or a range like V001-V050." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { data: existing } = await supabase.from("visitor_badges").select("number");
  const have = new Set((existing ?? []).map((b) => (b.number as string).toLowerCase()));
  const fresh = numbers.filter((n) => !have.has(n.toLowerCase()));
  if (fresh.length === 0) return { ok: false, error: "Those badges are already in the pool." };
  const { error } = await supabase.from("visitor_badges").insert(fresh.map((number) => ({ tenant_id: tenant.id, number })));
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true, added: fresh.length };
}

/** Retire a badge (lost, damaged) or bring it back. */
export async function setBadgeActive(id: string, active: boolean): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("visitor_badges").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** A badge flagged as not returned turned up after all. */
export async function markBadgeReturned(visitorId: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("visitors").update({ badge_returned: true, badge_returned_at: new Date().toISOString() }).eq("id", visitorId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
