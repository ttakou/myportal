"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccess } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import type { ActionResult } from "@/types/actions";
import {
  checkMove,
  firstStatus,
  groupPeople,
  isOpen,
  moveDirection,
  MOVE_KIND_LABEL,
  MOVE_KINDS,
  MOVE_REASONS,
  scheduledFor,
  scheduledMovements,
  shiftLabel,
  type MoveKind,
  type MoveReason,
  type MoveStatus,
  type LineMember,
  type PeopleGroup,
  type PersonMovements,
} from "@/lib/offshore/movement-change";
import { listMovementRequests, type MovementRequestRow } from "@/lib/offshore/movement-requests";
import { carryOutDueMoves, placeApprovedMove } from "@/lib/offshore/movement-run";
import { getPobOutlook } from "@/lib/offshore/pob-outlook-data";
import { peakDuring } from "@/lib/offshore/pob-outlook";
import { rev, tenantId } from "./_shared";

/**
 * Movement change requests: early / late mobilisation or demobilisation.
 *
 * Raised by the staff member, someone above them in the reporting line, or
 * the offshore desk. A staff member's own request is endorsed by their line
 * manager first; the OIM decides. Writes go through the service role after
 * the checks here.
 */

const today = () => new Date().toISOString().slice(0, 10);

async function me() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}

async function inMyLine(profileId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase.rpc("is_in_my_line", { p: profileId });
  return data === true;
}

async function deskAccess() {
  const a = await getAccess();
  return {
    desk: a.isAdmin || a.isOim || a.isCampboss || a.isDispatcher,
    decide: a.isAdmin || a.isOim,
  };
}

async function roleHolders(tenant: string, roles: string[]): Promise<string[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin.from("profile_roles").select("profile_id").eq("tenant_id", tenant).in("role", roles);
  return [...new Set((data ?? []).map((r) => r.profile_id as string))];
}

async function personName(id: string): Promise<string> {
  const admin = createAdminClient();
  if (!admin) return "Staff member";
  const { data } = await admin.from("profiles").select("full_name, email").eq("id", id).maybeSingle();
  return data?.full_name || data?.email || "Staff member";
}

/** The dates the person's next movements fall on, and their crew. */
async function movementsOf(profileId: string): Promise<{
  movements: PersonMovements;
  crewId: string | null;
  crewName: string | null;
  installationId: string | null;
  managerId: string | null;
} | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [{ data: staff }, { data: trip }, { data: prof }] = await Promise.all([
    admin
      .from("offshore_staff")
      .select("crew_id, is_rotational, crew:offshore_crews(name, offshore_days, onshore_days, cycle_start_date, installation_id)")
      .eq("profile_id", profileId)
      .maybeSingle(),
    admin.from("offshore_trips").select("mobilize_date, demob_date, installation_id").eq("profile_id", profileId).eq("status", "onboard").maybeSingle(),
    admin.from("profiles").select("manager_id").eq("id", profileId).maybeSingle(),
  ]);
  const crew = (Array.isArray(staff?.crew) ? staff?.crew[0] : staff?.crew) as
    | { name: string; offshore_days: number; onshore_days: number; cycle_start_date: string | null; installation_id: string | null }
    | null
    | undefined;
  const rotational = staff?.is_rotational !== false && !!crew;
  const movements = scheduledMovements({
    todayIso: today(),
    cycle: rotational && crew ? { offshore_days: Number(crew.offshore_days), onshore_days: Number(crew.onshore_days), cycle_start_date: crew.cycle_start_date } : null,
    trip: trip ? { mobilize_date: trip.mobilize_date as string, demob_date: (trip.demob_date as string | null) ?? null } : null,
  });
  return {
    movements,
    crewId: rotational ? ((staff?.crew_id as string | null) ?? null) : null,
    crewName: crew?.name ?? null,
    installationId: (trip?.installation_id as string | null) ?? crew?.installation_id ?? null,
    managerId: (prof?.manager_id as string | null) ?? null,
  };
}

/** May the signed-in user raise or see requests for this person? */
async function mayActFor(profileId: string, uid: string): Promise<boolean> {
  if (profileId === uid) return true;
  if ((await deskAccess()).desk) return true;
  return inMyLine(profileId);
}

export interface MovementPanel {
  me: string;
  /** People the user may raise a request for besides themselves: their team, sub-teams, then everyone else (desk only). */
  groups: PeopleGroup[];
  mine: MovementRequestRow[];
  raised: MovementRequestRow[];
  toEndorse: MovementRequestRow[];
}

/** Everything the self-service panel shows. */
export async function fetchMovementPanel(): Promise<{ ok: boolean; panel?: MovementPanel; error?: string }> {
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, error: "Not signed in." };
  const { desk } = await deskAccess();

  const [mine, raised, waiting, line] = await Promise.all([
    listMovementRequests(supabase, (q) => q.eq("profile_id", uid), 50),
    listMovementRequests(supabase, (q) => q.eq("requested_by", uid).neq("profile_id", uid), 100),
    listMovementRequests(supabase, (q) => q.eq("status", "pending_endorsement").neq("profile_id", uid), 100),
    supabase.rpc("team_line", { p_manager: null }),
  ]);

  // Endorsement belongs to the reporting line, not to the desk's wider view.
  const lineIds = new Set(((line.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id));
  const toEndorse = waiting.filter((r) => lineIds.has(r.profile_id));

  let offshore: { id: string; name: string }[] = [];
  const admin = createAdminClient();
  if (admin) {
    const tenant = await tenantId();
    const { data: staff } = await admin
      .from("offshore_staff")
      .select("profile_id, profile:profiles!offshore_staff_profile_id_fkey(full_name, email, is_active)")
      .eq("tenant_id", tenant ?? "");
    offshore = ((staff ?? []) as Record<string, any>[])
      .map((s) => {
        const p = Array.isArray(s.profile) ? s.profile[0] : s.profile;
        return { id: s.profile_id as string, name: (p?.full_name || p?.email || "—") as string, active: p?.is_active !== false };
      })
      .filter((p) => p.active)
      .map(({ id, name }) => ({ id, name }));
  }
  const groups = groupPeople({ me: uid, line: (line.data ?? []) as LineMember[], offshore, desk });
  return { ok: true, panel: { me: uid, groups, mine, raised, toEndorse } };
}

/** The person's scheduled movements, for the request form. */
export async function fetchPersonMovements(
  profileId: string,
): Promise<{ ok: boolean; movements?: PersonMovements; crewName?: string | null; open?: MoveKind[]; error?: string }> {
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, error: "Not signed in." };
  if (!(await mayActFor(profileId, uid))) return { ok: false, error: "You can only raise requests for yourself or your team." };
  const info = await movementsOf(profileId);
  if (!info) return { ok: false, error: "Not available." };
  const open = await listMovementRequests(supabase, (q) => q.eq("profile_id", profileId).in("status", ["pending_endorsement", "pending", "approved"]).is("applied_at", null), 20);
  return { ok: true, movements: info.movements, crewName: info.crewName, open: open.map((r) => r.kind) };
}

export async function requestMovementChange(input: {
  profileId: string;
  kind: MoveKind;
  requestedDate: string;
  reason: MoveReason;
  note?: string;
  coverNote?: string;
}): Promise<ActionResult> {
  const { uid } = await me();
  if (!uid) return { ok: false, error: "Not signed in." };
  if (!MOVE_KINDS.includes(input.kind)) return { ok: false, error: "Pick what you are asking for." };
  if (!MOVE_REASONS.includes(input.reason)) return { ok: false, error: "Pick a reason." };
  if (!(await mayActFor(input.profileId, uid))) return { ok: false, error: "You can only raise requests for yourself or your team." };
  const tenant = await tenantId();
  const admin = createAdminClient();
  if (!tenant || !admin) return { ok: false, error: "Not available." };

  const info = await movementsOf(input.profileId);
  if (!info) return { ok: false, error: "Not available." };
  const problem = checkMove({ kind: input.kind, movements: info.movements, requested: input.requestedDate, todayIso: today() });
  if (problem) return { ok: false, error: problem };
  const scheduled = scheduledFor(input.kind, info.movements)!;

  // One change per movement at a time.
  const direction = moveDirection(input.kind);
  const { data: existing } = await admin
    .from("offshore_movement_requests")
    .select("kind")
    .eq("profile_id", input.profileId)
    .in("status", ["pending_endorsement", "pending", "approved"])
    .is("applied_at", null);
  if ((existing ?? []).some((e) => moveDirection(e.kind as MoveKind) === direction)) {
    return { ok: false, error: `There is already an open change for this ${direction === "out" ? "mobilisation" : "demobilisation"}. Withdraw it first, or ask the offshore desk.` };
  }

  const selfRaised = input.profileId === uid;
  const status: MoveStatus = firstStatus({ selfRaised, hasManager: !!info.managerId });
  const { data: row, error } = await admin
    .from("offshore_movement_requests")
    .insert({
      tenant_id: tenant,
      profile_id: input.profileId,
      crew_id: info.crewId,
      installation_id: info.installationId,
      kind: input.kind,
      scheduled_date: scheduled,
      requested_date: input.requestedDate,
      reason: input.reason,
      note: input.note?.trim() || null,
      cover_note: input.coverNote?.trim() || null,
      status,
      requested_by: uid,
    })
    .select("id")
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "Could not save the request." };

  const who = await personName(input.profileId);
  const what = `${MOVE_KIND_LABEL[input.kind]}: ${who}, ${scheduled} → ${input.requestedDate} (${shiftLabel(input.kind, scheduled, input.requestedDate)})`;
  if (status === "pending_endorsement" && info.managerId) {
    await notifyUsers({
      tenantId: tenant,
      profileIds: [info.managerId],
      category: "approval",
      title: `Endorse a date change: ${who}`,
      body: what,
      url: "/offshore?view=mytrips",
      module: "offshore",
    });
  } else {
    await notifyUsers({
      tenantId: tenant,
      profileIds: await roleHolders(tenant, ["oim"]),
      category: "approval",
      title: `Date change to decide: ${who}`,
      body: what,
      url: "/offshore?view=requests",
      module: "offshore",
    });
  }
  rev();
  return { ok: true };
}

async function loadOne(id: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("offshore_movement_requests").select("*").eq("id", id).maybeSingle();
  return data as Record<string, any> | null;
}

/** The requester or the person withdraws a request not yet decided. */
export async function withdrawMovementChange(id: string): Promise<ActionResult> {
  const { uid } = await me();
  const r = await loadOne(id);
  if (!uid || !r) return { ok: false, error: "Request not found." };
  if (r.requested_by !== uid && r.profile_id !== uid) return { ok: false, error: "Only whoever raised it can withdraw it." };
  if (!isOpen(r.status)) return { ok: false, error: "It has been decided already." };
  const { error } = await createAdminClient()!.from("offshore_movement_requests").update({ status: "withdrawn" }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** The line manager (or anyone above) endorses or turns down a staff member's request. */
export async function endorseMovementChange(id: string, endorse: boolean, comment?: string): Promise<ActionResult> {
  const { uid } = await me();
  const r = await loadOne(id);
  if (!uid || !r) return { ok: false, error: "Request not found." };
  if (r.status !== "pending_endorsement") return { ok: false, error: "It is not waiting for endorsement." };
  if (r.profile_id === uid || !(await inMyLine(r.profile_id))) return { ok: false, error: "Only their line manager can endorse it." };
  if (!endorse && !comment?.trim()) return { ok: false, error: "Say why it is turned down." };
  const now = new Date().toISOString();
  const patch = endorse
    ? { status: "pending", endorsed_by: uid, endorsed_at: now, endorse_comment: comment?.trim() || null }
    : { status: "rejected", endorsed_by: uid, endorsed_at: now, endorse_comment: comment!.trim(), decided_by: uid, decided_at: now, decision_comment: comment!.trim() };
  const { error } = await createAdminClient()!.from("offshore_movement_requests").update(patch).eq("id", id).eq("status", "pending_endorsement");
  if (error) return { ok: false, error: error.message };

  const who = await personName(r.profile_id);
  const what = `${MOVE_KIND_LABEL[r.kind as MoveKind]}: ${who}, ${r.scheduled_date} → ${r.requested_date}`;
  if (endorse) {
    await notifyUsers({
      tenantId: r.tenant_id,
      profileIds: await roleHolders(r.tenant_id, ["oim"]),
      category: "approval",
      title: `Date change to decide: ${who} (endorsed)`,
      body: what,
      url: "/offshore?view=requests",
      module: "offshore",
    });
  } else {
    await notifyUsers({
      tenantId: r.tenant_id,
      profileIds: [r.profile_id, r.requested_by],
      category: "approval",
      title: "Date change not endorsed",
      body: `${what}. ${comment!.trim()}`,
      url: "/offshore?view=mytrips",
      module: "offshore",
    });
  }
  rev();
  return { ok: true };
}

/** The OIM decides. Approval fixes the manifests now and moves the person on the date. */
export async function decideMovementChange(id: string, approve: boolean, comment?: string): Promise<ActionResult> {
  const { uid } = await me();
  const r = await loadOne(id);
  if (!uid || !r) return { ok: false, error: "Request not found." };
  if (!(await deskAccess()).decide) return { ok: false, error: "Only the OIM decides date changes." };
  if (!isOpen(r.status)) return { ok: false, error: "It has been decided already." };
  if (!approve && !comment?.trim()) return { ok: false, error: "Say why it is rejected." };
  if (approve && r.requested_date < today()) return { ok: false, error: "The requested date has passed; ask for a new date." };

  const admin = createAdminClient()!;
  const { error } = await admin
    .from("offshore_movement_requests")
    .update({ status: approve ? "approved" : "rejected", decided_by: uid, decided_at: new Date().toISOString(), decision_comment: comment?.trim() || null })
    .eq("id", id)
    .in("status", ["pending_endorsement", "pending"]);
  if (error) return { ok: false, error: error.message };

  if (approve) {
    await placeApprovedMove(admin, r.tenant_id, id, today());
    if (r.requested_date <= today()) await carryOutDueMoves(admin, r.tenant_id, today());
  }

  const who = await personName(r.profile_id);
  const what = `${MOVE_KIND_LABEL[r.kind as MoveKind]}: ${who}, ${r.scheduled_date} → ${r.requested_date}`;
  const desk = approve ? await roleHolders(r.tenant_id, ["dispatcher", "campboss"]) : [];
  await notifyUsers({
    tenantId: r.tenant_id,
    profileIds: [r.profile_id, r.requested_by, r.endorsed_by, ...desk],
    category: "approval",
    title: approve ? `Date change approved: ${who}` : `Date change rejected: ${who}`,
    body: comment?.trim() ? `${what}. ${comment.trim()}` : what,
    url: "/offshore?view=mytrips",
    module: "offshore",
  });
  rev();
  return { ok: true };
}

export interface MovementDeskRow extends MovementRequestRow {
  /** For a change that adds days on board: the fullest day then, with this person, against the limit. */
  pob: { peak: number; capacity: number; date: string | null; over: boolean } | null;
  /** Earlier changes for the same person this year: count and days moved. */
  history: { count: number; days: number };
}

/** The OIM's desk: everything open, with what each would do to the POB, and the last month decided. */
export async function fetchMovementDesk(): Promise<{ ok: boolean; open?: MovementDeskRow[]; recent?: MovementRequestRow[]; canDecide?: boolean; error?: string }> {
  const { desk, decide } = await deskAccess();
  if (!desk) return { ok: false, error: "Offshore desk only." };
  const supabase = createClient();
  const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const yearStart = `${today().slice(0, 4)}-01-01T00:00:00Z`;
  const [open, recent, year] = await Promise.all([
    listMovementRequests(supabase, (q) => q.in("status", ["pending_endorsement", "pending"]), 200),
    listMovementRequests(supabase, (q) => q.in("status", ["approved", "rejected", "withdrawn"]).gte("updated_at", since), 200),
    listMovementRequests(supabase, (q) => q.eq("status", "approved").gte("decided_at", yearStart), 1000),
  ]);

  let outlook: Awaited<ReturnType<typeof getPobOutlook>> = [];
  const adding = open.filter((r) => r.kind === "early_mob" || r.kind === "late_demob");
  if (adding.length) {
    const dates = adding.flatMap((r) => [r.scheduled_date, r.requested_date]).sort();
    outlook = await getPobOutlook(dates[0], dates[dates.length - 1]);
  }
  const rows: MovementDeskRow[] = open.map((r) => {
    const stay =
      r.kind === "early_mob" ? { from: r.requested_date, to: r.scheduled_date } : r.kind === "late_demob" ? { from: r.scheduled_date, to: r.requested_date } : null;
    const past = year.filter((y) => y.profile_id === r.profile_id);
    return {
      ...r,
      // The outlook already lists this request as pending, not in the count: add it.
      pob: stay ? peakDuring(outlook, r.installation_id, stay, true) : null,
      history: {
        count: past.length,
        days: past.reduce((n, y) => n + Math.abs(Math.round((Date.parse(y.requested_date) - Date.parse(y.scheduled_date)) / 86_400_000)), 0),
      },
    };
  });
  return { ok: true, open: rows, recent, canDecide: decide };
}

/** Every date change for one person, for the desk's staff rotation history. */
export async function fetchPersonMovementHistory(profileId: string): Promise<{ ok: boolean; rows?: MovementRequestRow[]; error?: string }> {
  const { supabase, uid } = await me();
  if (!uid) return { ok: false, error: "Not signed in." };
  if (!(await mayActFor(profileId, uid))) return { ok: false, error: "Not available." };
  return { ok: true, rows: await listMovementRequests(supabase, (q) => q.eq("profile_id", profileId), 100) };
}
