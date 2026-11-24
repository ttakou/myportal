"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/types/actions";
import { siteToday } from "@/lib/offshore/manifest-order";
import { movesPeopleNow } from "@/lib/offshore/undo-mobilise";
import { confirmStep, noShowEffect, TRAVELLED, type ConfirmStep } from "@/lib/offshore/run-reconcile";
import { offshoreDefaultInstallation, placeVisitsOnManifests } from "@/lib/offshore/day-manifest-run";
import { placeApprovedMove } from "@/lib/offshore/movement-run";
import { postponedKind } from "@/lib/offshore/movement-change";
import { nextDay } from "@/lib/offshore/today";
import { closeNotices } from "@/lib/notify";
import { runConfirmRef } from "@/lib/offshore/run-reminders";
import { resyncDaySheets } from "@/lib/offshore/meal-sheet-run";
import { requireOffshoreDispatch, rev, tenantId } from "./_shared";
import { parsePick } from "@/lib/offshore/traveller-picks";

/**
 * Making a run's manifest reflect what really happened that morning — the
 * nightly job has already moved people by the schedule. See
 * lib/offshore/run-reconcile.ts for the rules.
 */

type Row = Record<string, any>;

const refresh = () => {
  rev();
  revalidatePath("/offshore/today");
};

/** POB changed on a run's day: today's meal sheet follows (arrivals off, leavers back with dinner and a bed). */
async function mealsFollow(tenant: string | null | undefined, day: string) {
  const admin = createAdminClient();
  if (!tenant || !admin || day !== siteToday()) return;
  await resyncDaySheets(admin, tenant, day);
}

async function loadManifest(supabase: ReturnType<typeof createClient>, id: string) {
  const { data } = await supabase
    .from("offshore_manifests")
    .select("id, tenant_id, title, direction, scheduled_date, status, installation_id")
    .eq("id", id)
    .maybeSingle();
  return data as Row | null;
}

/**
 * Mark (or clear) a no-show. On a run that has already moved people, POB is
 * put right too: an arrival who never came comes off; a leaver who stayed is
 * kept on board. Otherwise only the mark changes.
 */
export async function setRunNoShow(paxId: string, noShow: boolean): Promise<ActionResult> {
  const gate = await requireOffshoreDispatch("operate");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: pax } = await supabase
    .from("offshore_manifest_pax")
    .select("id, manifest_id, profile_id, visit_request_id")
    .eq("id", paxId)
    .maybeSingle();
  if (!pax) return { ok: false, error: "Passenger not found." };
  const m = await loadManifest(supabase, pax.manifest_id as string);
  if (!m) return { ok: false, error: "Manifest not found." };
  if (m.status === "cancelled") return { ok: false, error: "This manifest is cancelled." };
  const day = String(m.scheduled_date);
  const direction = m.direction as "out" | "in";

  // The record a no-show would change, if the run has moved this person.
  let tripId: string | null = null;
  let visitId: string | null = null;
  if (pax.profile_id) {
    let q = supabase.from("offshore_trips").select("id").eq("profile_id", pax.profile_id);
    if (direction === "out") q = noShow ? q.eq("status", "onboard").eq("mobilize_date", day) : q.eq("status", "cancelled").eq("mobilize_date", day);
    else q = noShow ? q.eq("status", "demobilised").eq("demob_date", day) : q.eq("status", "onboard");
    const { data } = await q.order("updated_at", { ascending: false }).limit(1);
    tripId = (data?.[0]?.id as string | undefined) ?? null;
  } else if (pax.visit_request_id) {
    const { data: v } = await supabase
      .from("offshore_visit_requests")
      .select("id, status, depart_date, return_date")
      .eq("id", pax.visit_request_id)
      .maybeSingle();
    const ok =
      !!v &&
      (direction === "out"
        ? noShow
          ? v.status === "onboard" && v.depart_date === day
          : v.status === "approved" && v.depart_date === day
        : noShow
          ? v.status === "returned" && v.return_date === day
          : v.status === "onboard");
    visitId = ok ? (v!.id as string) : null;
  }

  const effect = noShowEffect({ direction, scheduledDate: day, today: siteToday(), noShow, hasRecord: !!(tripId || visitId) });
  const now = new Date().toISOString();
  if (tripId) {
    const patch: Row =
      effect === "take-off"
        ? { status: "cancelled", cancelled_at: now, cancelled_by: user?.id ?? null }
        : effect === "put-back-on"
          ? { status: "onboard", cancelled_at: null, cancelled_by: null }
          : effect === "keep-aboard"
            ? { status: "onboard", demob_date: null }
            : effect === "send-home"
              ? { status: "demobilised", demob_date: day }
              : {};
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("offshore_trips").update(patch).eq("id", tripId);
      if (error) return { ok: false, error: error.message };
    }
  } else if (visitId) {
    const status =
      effect === "take-off" ? "approved" : effect === "put-back-on" || effect === "keep-aboard" ? "onboard" : effect === "send-home" ? "returned" : null;
    if (status) {
      const { error } = await supabase.from("offshore_visit_requests").update({ status }).eq("id", visitId);
      if (error) return { ok: false, error: error.message };
    }
  }

  const { error } = await supabase
    .from("offshore_manifest_pax")
    .update(noShow ? { no_show: true, boarded: false } : { no_show: false })
    .eq("id", paxId);
  if (error) return { ok: false, error: error.message };
  await mealsFollow(m.tenant_id as string, day);
  refresh();
  return { ok: true };
}

/** Board (MOB) or send home (DEMOB) one staff member, dated the run's day. */
async function moveStaff(
  supabase: ReturnType<typeof createClient>,
  m: Row,
  profileId: string,
  installationId: string | null,
  step: ConfirmStep,
  aboardTripId: string | null,
): Promise<string | null> {
  const day = String(m.scheduled_date);
  if (step === "board") {
    const { data: s } = await supabase
      .from("offshore_staff")
      .select("crew_id, fixed_room_id, fixed_bed, lifeboat")
      .eq("profile_id", profileId)
      .maybeSingle();
    const { error } = await supabase.from("offshore_trips").insert({
      tenant_id: m.tenant_id,
      profile_id: profileId,
      installation_id: installationId,
      crew_id: (s?.crew_id as string | null) ?? null,
      category: "staff",
      trip_type: "crew_change_out",
      mobilize_date: day,
      status: "onboard",
      hse_cleared_at: new Date().toISOString(),
      room_id: (s?.fixed_room_id as string | null) ?? null,
      bed_no: (s?.fixed_bed as string | null) ?? null,
      lifeboat: (s?.lifeboat as string | null) ?? null,
      mode: "manual",
    });
    return error?.message ?? null;
  }
  if (step === "send-home" && aboardTripId) {
    const { error } = await supabase
      .from("offshore_trips")
      .update({ status: "demobilised", demob_date: day })
      .eq("id", aboardTripId);
    return error?.message ?? null;
  }
  return null;
}

/**
 * The Dispatcher confirms the run once the boat or helicopter has gone:
 * everyone not marked no-show is settled (boarded or sent home if the night
 * run had not already done it) and ticked; the manifest is closed with who
 * confirmed it and when. People on a DEMOB list who were never on board are
 * left unticked.
 */
export async function confirmRun(
  manifestId: string,
): Promise<ActionResult & { travelled?: number; notAboard?: number }> {
  const gate = await requireOffshoreDispatch("operate");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const m = await loadManifest(supabase, manifestId);
  if (!m) return { ok: false, error: "Manifest not found." };
  if (m.status === "cancelled") return { ok: false, error: "This manifest is cancelled." };
  if (m.status === "completed") return { ok: false, error: "This run is already confirmed." };
  const day = String(m.scheduled_date);
  if (!movesPeopleNow(day, siteToday())) return { ok: false, error: `This run is for ${day}. Confirm it on the day.` };
  const direction = m.direction as "out" | "in";
  const tenant = await tenantId();
  const admin = createAdminClient();
  const installationId =
    (m.installation_id as string | null) ?? (tenant && admin ? await offshoreDefaultInstallation(admin, tenant) : null);

  const { data: paxRows } = await supabase
    .from("offshore_manifest_pax")
    .select("id, profile_id, visit_request_id, no_show")
    .eq("manifest_id", manifestId);
  const pax = (paxRows ?? []) as Row[];
  const ids = pax.map((p) => p.profile_id).filter(Boolean) as string[];
  const vids = pax.map((p) => p.visit_request_id).filter(Boolean) as string[];
  const [{ data: aboard }, { data: left }, { data: visits }] = await Promise.all([
    ids.length ? supabase.from("offshore_trips").select("id, profile_id").eq("status", "onboard").in("profile_id", ids) : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("offshore_trips").select("profile_id").eq("status", "demobilised").eq("demob_date", day).in("profile_id", ids)
      : Promise.resolve({ data: [] }),
    vids.length ? supabase.from("offshore_visit_requests").select("id, status, return_date").in("id", vids) : Promise.resolve({ data: [] }),
  ]);
  const aboardTrip = new Map(((aboard ?? []) as Row[]).map((t) => [String(t.profile_id), String(t.id)]));
  const leftToday = new Set(((left ?? []) as Row[]).map((t) => String(t.profile_id)));
  const visitOf = new Map(((visits ?? []) as Row[]).map((v) => [String(v.id), v]));

  let travelled = 0;
  let notAboard = 0;
  const ticked: string[] = [];
  for (const p of pax) {
    let step: ConfirmStep;
    if (p.profile_id) {
      const pid = String(p.profile_id);
      step = confirmStep({ direction, noShow: !!p.no_show, aboard: aboardTrip.has(pid), leftOnDay: leftToday.has(pid) });
      const err = await moveStaff(supabase, m, pid, installationId, step, aboardTrip.get(pid) ?? null);
      if (err) return { ok: false, error: err };
    } else if (p.visit_request_id) {
      const v = visitOf.get(String(p.visit_request_id));
      const vAboard = v?.status === "onboard";
      step = confirmStep({ direction, noShow: !!p.no_show, aboard: vAboard, leftOnDay: v?.status === "returned" && v?.return_date === day });
      const status = step === "board" ? "onboard" : step === "send-home" ? "returned" : null;
      if (status && v) await supabase.from("offshore_visit_requests").update({ status }).eq("id", v.id);
    } else {
      step = p.no_show ? "skip" : "already-aboard"; // a free-text name: nothing to move
    }
    if (TRAVELLED.has(step)) {
      travelled++;
      ticked.push(String(p.id));
    }
    if (step === "not-aboard") notAboard++;
  }

  if (ticked.length) await supabase.from("offshore_manifest_pax").update({ boarded: true }).in("id", ticked);
  const { error } = await supabase
    .from("offshore_manifests")
    .update({ status: "completed", confirmed_by: user?.id ?? null, confirmed_at: new Date().toISOString() })
    .eq("id", manifestId);
  if (error) return { ok: false, error: error.message };
  await closeNotices(String(m.tenant_id), [runConfirmRef(manifestId)]);
  await mealsFollow(m.tenant_id as string, day);
  refresh();
  return {
    ok: true,
    travelled,
    notAboard,
    warning: notAboard ? `${notAboard} on the list were not on board, so nothing changed for them.` : undefined,
  };
}

/**
 * Someone travelled who was not on the list: add them to the run and, on or
 * after its day, board them (MOB) or send them home (DEMOB) dated that day.
 *
 * Anyone in the people database can be picked, not only the offshore roster,
 * and any registered visitor. Someone POB missed is put right where it can be:
 * a MOB arrival is boarded. A DEMOB leaver POB never had is listed on the run
 * by name only (nothing on board to take off), and the result says so.
 */
export async function addRunTraveller(input: {
  manifestId: string;
  /** A pick id: "p:<profile id>" or "v:<visit request id>". */
  pick?: string;
  /** Older callers: a profile id. */
  profileId?: string;
}): Promise<ActionResult & { warning?: string }> {
  const gate = await requireOffshoreDispatch("operate");
  if (gate) return gate;
  const target = input.pick ? parsePick(input.pick) : input.profileId ? { kind: "person" as const, id: input.profileId } : null;
  if (!target) return { ok: false, error: "Pick someone from the list." };
  const supabase = createClient();
  const m = await loadManifest(supabase, input.manifestId);
  if (!m) return { ok: false, error: "Manifest not found." };
  if (m.status === "cancelled") return { ok: false, error: "This manifest is cancelled." };
  const day = String(m.scheduled_date);
  const moveNow = movesPeopleNow(day, siteToday());
  const res = target.kind === "person" ? await addPerson(supabase, m, target.id, moveNow) : await addVisitor(supabase, m, target.id, moveNow);
  if (!res.ok) return res;
  await mealsFollow(m.tenant_id as string, day);
  refresh();
  return { ok: true, warning: res.warning };
}

async function addPerson(
  supabase: ReturnType<typeof createClient>,
  m: Row,
  profileId: string,
  moveNow: boolean,
): Promise<ActionResult & { warning?: string }> {
  const { data: dup } = await supabase
    .from("offshore_manifest_pax")
    .select("id")
    .eq("manifest_id", m.id)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (dup) return { ok: false, error: "Already on this manifest." };

  const [{ data: prof }, { data: staff }, { data: aboard }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", profileId).maybeSingle(),
    supabase.from("offshore_staff").select("position").eq("profile_id", profileId).maybeSingle(),
    supabase.from("offshore_trips").select("id").eq("profile_id", profileId).eq("status", "onboard").limit(1),
  ]);
  if (!prof) return { ok: false, error: "Person not found." };
  const name = (prof.full_name as string | null) || (prof.email as string | null) || "Passenger";
  const direction = m.direction as "out" | "in";
  const aboardTripId = (aboard?.[0]?.id as string | undefined) ?? null;
  let warning: string | undefined;
  let linked = true;

  if (moveNow) {
    const step = confirmStep({ direction, noShow: false, aboard: !!aboardTripId, leftOnDay: false });
    if (step === "not-aboard") {
      // On board without being in POB: list them by name; POB had nothing to take off.
      linked = false;
      warning = `${name} was not in POB, so POB is unchanged; they are listed on this run by name.`;
    } else {
      if (step === "already-aboard") warning = `${name} was already in POB; listed on this run, POB unchanged.`;
      const tenant = await tenantId();
      const admin = createAdminClient();
      const installationId =
        (m.installation_id as string | null) ?? (tenant && admin ? await offshoreDefaultInstallation(admin, tenant) : null);
      const err = await moveStaff(supabase, m, profileId, installationId, step, aboardTripId);
      if (err) return { ok: false, error: err };
    }
  }

  const { error } = await supabase.from("offshore_manifest_pax").insert({
    tenant_id: m.tenant_id,
    manifest_id: m.id,
    profile_id: linked ? profileId : null,
    person_name: name,
    position: (staff?.position as string | null) ?? null,
    boarded: moveNow,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, warning };
}

async function addVisitor(
  supabase: ReturnType<typeof createClient>,
  m: Row,
  visitId: string,
  moveNow: boolean,
): Promise<ActionResult & { warning?: string }> {
  const { data: picked } = await supabase
    .from("offshore_visit_requests")
    .select("id, visitor_name, visitor_company, status, depart_date, return_date, lifeboat")
    .eq("id", visitId)
    .maybeSingle();
  if (!picked) return { ok: false, error: "Visitor not found." };
  const name = String(picked.visitor_name).trim();
  const day = String(m.scheduled_date);
  const direction = m.direction as "out" | "in";

  const { data: onRun } = await supabase.from("offshore_manifest_pax").select("person_name").eq("manifest_id", m.id);
  if (((onRun ?? []) as Row[]).some((p) => String(p.person_name).trim().toLowerCase() === name.toLowerCase()))
    return { ok: false, error: "Already on this manifest." };

  // Their visit on board now, if any (a visitor can have come more than once).
  const { data: aboardRows } = await supabase
    .from("offshore_visit_requests")
    .select("id")
    .eq("tenant_id", m.tenant_id)
    .ilike("visitor_name", name.replace(/[%_\\]/g, "\\$&"))
    .eq("status", "onboard")
    .limit(1);
  const aboardId = (aboardRows?.[0]?.id as string | undefined) ?? null;

  let linkId: string | null = null;
  let warning: string | undefined;
  if (direction === "out") {
    if (aboardId) {
      linkId = aboardId;
      warning = `${name} was already in POB; listed on this run, POB unchanged.`;
    } else if (picked.status === "approved" && picked.depart_date === day) {
      // Their planned visit for this day: it starts now.
      linkId = String(picked.id);
      if (moveNow) await supabase.from("offshore_visit_requests").update({ status: "onboard" }).eq("id", linkId);
    } else {
      // A past visitor coming again: a new casual visit, as the live board records one.
      const { data: made, error } = await supabase
        .from("offshore_visit_requests")
        .insert({
          tenant_id: m.tenant_id,
          visitor_name: name,
          visitor_company: (picked.visitor_company as string | null) ?? null,
          installation_id: (m.installation_id as string | null) ?? null,
          depart_date: day,
          overnight: false,
          accommodation_required: false,
          status: moveNow ? "onboard" : "approved",
          is_casual: true,
          lifeboat: (picked.lifeboat as string | null) ?? null,
        })
        .select("id")
        .maybeSingle();
      if (error || !made) return { ok: false, error: error?.message ?? "Could not record the visit." };
      linkId = String(made.id);
      if (moveNow && !picked.lifeboat) warning = `${name} has no lifeboat station yet: set one on the live board.`;
    }
  } else if (aboardId) {
    linkId = aboardId;
    if (moveNow) await supabase.from("offshore_visit_requests").update({ status: "returned", return_date: day }).eq("id", aboardId);
  } else {
    warning = `${name} was not in POB, so POB is unchanged; they are listed on this run by name.`;
  }

  const { error } = await supabase.from("offshore_manifest_pax").insert({
    tenant_id: m.tenant_id,
    manifest_id: m.id,
    visit_request_id: linkId,
    person_name: name,
    position: "Visitor",
    boarded: moveNow,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, warning };
}

/**
 * The run did not go (weather, breakdown): put it back a day. This
 * morning's automatic movement is undone for everyone on it, each traveller
 * gets an approved late move to the next day (so that night's run carries it
 * out and puts them on that day's manifest), and this run is closed as
 * postponed. No-shows and people never concerned are left as they are.
 */
export async function postponeRun(manifestId: string): Promise<ActionResult & { postponed?: number; to?: string }> {
  const gate = await requireOffshoreDispatch("operate");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tenant = await tenantId();
  const admin = createAdminClient();
  if (!tenant || !admin) return { ok: false, error: "No organisation in scope." };
  const m = await loadManifest(supabase, manifestId);
  if (!m) return { ok: false, error: "Manifest not found." };
  if (m.status === "completed") return { ok: false, error: "This run is already confirmed as gone." };
  if (m.status === "cancelled") return { ok: false, error: "This manifest is cancelled." };
  const day = String(m.scheduled_date);
  const to = nextDay(day);
  const direction = m.direction as "out" | "in";
  const today = siteToday();
  const now = new Date().toISOString();

  const { data: paxRows } = await admin
    .from("offshore_manifest_pax")
    .select("id, profile_id, visit_request_id, no_show, person_name")
    .eq("manifest_id", manifestId);
  const pax = ((paxRows ?? []) as Row[]).filter((p) => !p.no_show);
  let postponed = 0;
  const visitIds: string[] = [];

  for (const p of pax) {
    if (p.profile_id) {
      const pid = String(p.profile_id);
      const { data: trips } = await admin
        .from("offshore_trips")
        .select("id, status, mobilize_date, demob_date")
        .eq("tenant_id", tenant)
        .eq("profile_id", pid)
        .in("status", ["onboard", "demobilised"])
        .order("updated_at", { ascending: false })
        .limit(3);
      const list = (trips ?? []) as Row[];
      const aboard = list.find((t) => t.status === "onboard");
      if (direction === "out") {
        // Aboard since before the run: not travelling on it, leave them be.
        if (aboard && aboard.mobilize_date < day) continue;
        // Boarded by this morning's run: undo it — they never left the shore.
        if (aboard && aboard.mobilize_date === day) await admin.from("offshore_trips").delete().eq("id", aboard.id);
      } else {
        const leftToday = list.find((t) => t.status === "demobilised" && t.demob_date === day);
        if (!aboard && !leftToday) continue; // never on board: nothing to put back
        // Sent home by this morning's run: back on board until the new day.
        if (leftToday && !aboard) {
          await admin.from("offshore_trips").update({ status: "onboard", demob_date: to }).eq("id", leftToday.id);
        }
      }
      const { data: staff } = await admin
        .from("offshore_staff")
        .select("crew_id")
        .eq("profile_id", pid)
        .maybeSingle();
      const { data: move, error } = await admin
        .from("offshore_movement_requests")
        .insert({
          tenant_id: tenant,
          profile_id: pid,
          crew_id: (staff?.crew_id as string | null) ?? null,
          installation_id: (m.installation_id as string | null) ?? null,
          kind: postponedKind(direction),
          scheduled_date: day,
          requested_date: to,
          reason: "operational",
          note: "Run postponed (weather / transport).",
          status: "approved",
          requested_by: user?.id ?? null,
          decided_by: user?.id ?? null,
          decided_at: now,
          decision_comment: `Run of ${day} postponed to ${to}.`,
        })
        .select("id")
        .maybeSingle();
      if (error || !move) return { ok: false, error: error?.message ?? "Could not record the postponement." };
      // Off this run, onto the new day's manifest; that night's run moves them.
      await placeApprovedMove(admin, tenant, move.id as string, today);
      postponed++;
    } else if (p.visit_request_id) {
      const { data: v } = await admin
        .from("offshore_visit_requests")
        .select("id, status, depart_date, return_date")
        .eq("id", p.visit_request_id)
        .maybeSingle();
      if (!v) continue;
      const shift = (d: string | null) => (d ? nextDay(d) : null);
      const patch: Row | null =
        direction === "out" && v.depart_date === day
          ? { status: v.status === "onboard" ? "approved" : v.status, depart_date: to, return_date: shift(v.return_date as string | null) }
          : direction === "in" && v.return_date === day
            ? { status: v.status === "returned" ? "onboard" : v.status, return_date: to }
            : null;
      if (!patch) continue;
      await admin.from("offshore_visit_requests").update(patch).eq("id", v.id);
      await admin.from("offshore_manifest_pax").delete().eq("id", p.id);
      visitIds.push(String(v.id));
      postponed++;
    }
  }
  if (visitIds.length) await placeVisitsOnManifests(admin, tenant, visitIds, to);

  const { error } = await admin
    .from("offshore_manifests")
    .update({ status: "cancelled", title: `${m.title ?? "Run"} · postponed to ${to}` })
    .eq("id", manifestId);
  if (error) return { ok: false, error: error.message };
  await closeNotices(tenant, [runConfirmRef(manifestId)]);
  await mealsFollow(m.tenant_id as string, day);
  refresh();
  return { ok: true, postponed, to };
}
