import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";
import { one } from "./_shared";
import { scheduleWindow } from "./rotation-math";
import {
  classifyStaleTrips,
  crewChangesAhead,
  crewChangesDueToday,
  reminderForBackToBack,
  reminderForDeskDay,
  reminderForMember,
  STALE_CANCEL_DAYS,
  STALE_FLAG_DAYS,
  type CrewChangeDue,
  type ScheduledCrew,
} from "./schedule-actions";
import { scheduleActs, type OffshoreScheduleSettings } from "./schedule-settings";
import { addVisitorsToDayManifests, advanceVisitorStatuses, closePastManifests, ensureDayManifests } from "./day-manifest-run";
import { DAY_MANIFEST_HORIZON_DAYS } from "./day-manifests";
import { carryOutDueMoves, movedAwayOn } from "./movement-run";
import { getLookAhead } from "./look-ahead";
import { buildMealSheet } from "./meal-sheet-run";

/**
 * The nightly job that makes the rotation schedule act.
 *
 * For every tenant with the offshore module, on the service-role client:
 *
 *  - Crew changes the schedule puts on today are opened — boarded on the
 *    mobilise day, demobilised at hitch end — when the tenant has said the
 *    schedule may act (automatic mode, nightly switch on). Otherwise the desk
 *    is prompted to open them on the dashboard, where the existing prompt
 *    already waits.
 *  - Three days before a crew change, the people on the crew, their
 *    back-to-backs and the desk are told.
 *  - Trips whose mobilise date passed a week ago with no movement are flagged
 *    to the desk; a month, and they are cancelled and the person told.
 *
 * Every notification is sent once: a re-run the same day, or a day missed,
 * does not double or drop a message (see `notifyOnce`).
 */

const todayIsoNow = () => new Date().toISOString().slice(0, 10);

const DESK_ROLES = ["dispatcher", "campboss", "oim"];
const NOT_MOVED = ["requested", "hse_cleared", "manifested"];

export interface TenantScheduleSummary {
  tenantId: string;
  acts: boolean;
  mobilised: number;
  demobilised: number;
  prompted: number;
  reminded: number;
  staleFlagged: number;
  staleCancelled: number;
  /** Crew change day manifests created ahead (MOB and DEMOB per day). */
  dayManifests: number;
  /** Approved visitors added to manifests made before they were approved. */
  visitorsManifested: number;
  /** Visitors moved by their dates: on board, and returned. */
  visitorsBoarded: number;
  visitorsReturned: number;
  /** Approved movement changes carried out (boarded or demobilised early/late). */
  movesCarriedOut: number;
  /** Monday look-ahead messages sent. */
  lookAheadSent: number;
  /** Meal sheets generated (or brought up to date) for today. */
  mealSheets: number;
  /** Past manifests closed. */
  manifestsClosed: number;
}

type Row = Record<string, unknown>;

/**
 * Deliver a notification to those of `profileIds` who have not had one with
 * this title and url in the last `windowDays`. The job runs nightly and may
 * be re-run by hand; the same person must not be told the same thing twice.
 */
async function notifyOnce(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    profileIds: string[];
    category: "approval" | "general";
    title: string;
    body: string;
    url: string;
  },
  windowDays: number,
): Promise<number> {
  const ids = [...new Set(input.profileIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data: sent } = await admin
    .from("notifications")
    .select("profile_id")
    .eq("tenant_id", input.tenantId)
    .eq("title", input.title)
    .eq("url", input.url)
    .gte("created_at", since)
    .in("profile_id", ids);
  const done = new Set((sent ?? []).map((r) => r.profile_id as string));
  const fresh = ids.filter((id) => !done.has(id));
  if (fresh.length === 0) return 0;
  // Some of these link to the dashboard, so name the module they belong to.
  await notifyUsers({ ...input, profileIds: fresh, module: "offshore" });
  return fresh.length;
}

function settingsOf(raw: unknown): OffshoreScheduleSettings & { defaultInstallationId: string | null } {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    mode: s.default_crew_change_mode === "manual" ? "manual" : "auto",
    nightly: s.nightly_crew_changes === "act" ? "act" : "prompt",
    defaultInstallationId: (s.default_installation_id as string | null) ?? null,
  };
}

export async function runOffshoreSchedule(
  todayIso: string = todayIsoNow(),
): Promise<{ ok: boolean; today: string; tenants: TenantScheduleSummary[]; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, today: todayIso, tenants: [], error: "Service-role key missing." };

  const { data: services } = await admin
    .from("tenant_services")
    .select("tenant_id, settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "offshore")
    .eq("is_active", true);

  const tenants: TenantScheduleSummary[] = [];
  for (const svc of (services ?? []) as Row[]) {
    const tenantId = String(svc.tenant_id);
    try {
      tenants.push(await runTenant(admin, tenantId, settingsOf(svc.settings), todayIso));
    } catch (e) {
      console.error(`offshore schedule: tenant ${tenantId} failed:`, (e as Error).message);
    }
  }
  return { ok: true, today: todayIso, tenants };
}

async function runTenant(
  admin: SupabaseClient,
  tenantId: string,
  settings: OffshoreScheduleSettings & { defaultInstallationId: string | null },
  today: string,
): Promise<TenantScheduleSummary> {
  const acts = scheduleActs(settings);
  const summary: TenantScheduleSummary = {
    tenantId,
    acts,
    mobilised: 0,
    demobilised: 0,
    prompted: 0,
    reminded: 0,
    staleFlagged: 0,
    staleCancelled: 0,
    dayManifests: 0,
    visitorsManifested: 0,
    movesCarriedOut: 0,
    lookAheadSent: 0,
    mealSheets: 0,
    manifestsClosed: 0,
    visitorsBoarded: 0,
    visitorsReturned: 0,
  };

  const [{ data: crewRows }, { data: deskRows }, { data: defaultInst }] = await Promise.all([
    admin
      .from("offshore_crews")
      .select(
        "id, name, offshore_days, onshore_days, cycle_start_date, installation_id, installation:offshore_installations(name)",
      )
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .not("cycle_start_date", "is", null),
    admin.from("profile_roles").select("profile_id").eq("tenant_id", tenantId).in("role", DESK_ROLES),
    settings.defaultInstallationId
      ? admin
          .from("offshore_installations")
          .select("id, name")
          .eq("id", settings.defaultInstallationId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const desk = [...new Set((deskRows ?? []).map((r) => r.profile_id as string))];
  const crews = (crewRows ?? []) as Row[];
  const crewIds = crews.map((c) => String(c.id));

  const [{ data: staffRows }, { data: aboardRows }] = crewIds.length
    ? await Promise.all([
        admin
          .from("offshore_staff")
          .select("profile_id, crew_id, fixed_room_id, fixed_bed, lifeboat, back_to_back_id")
          .eq("tenant_id", tenantId)
          .in("crew_id", crewIds),
        admin
          .from("offshore_trips")
          .select("id, profile_id")
          .eq("tenant_id", tenantId)
          .eq("status", "onboard")
          .not("profile_id", "is", null),
      ])
    : [{ data: [] }, { data: [] }];
  const staff = (staffRows ?? []) as Row[];
  const aboard = new Set((aboardRows ?? []).map((r) => r.profile_id as string));
  const staffByCrew = new Map<string, Row[]>();
  for (const s of staff) {
    const list = staffByCrew.get(String(s.crew_id)) ?? [];
    list.push(s);
    staffByCrew.set(String(s.crew_id), list);
  }

  const scheduled: ScheduledCrew[] = crews.map((c) => {
    const members = staffByCrew.get(String(c.id)) ?? [];
    return {
      id: String(c.id),
      name: String(c.name),
      cycle: {
        offshore_days: Number(c.offshore_days),
        onshore_days: Number(c.onshore_days),
        cycle_start_date: (c.cycle_start_date as string | null) ?? null,
      },
      members: members.length,
      aboard: members.filter((m) => aboard.has(String(m.profile_id))).length,
    };
  });
  const crewById = new Map(crews.map((c) => [String(c.id), c]));
  const installationOf = (crewId: string): { id: string | null; name: string | null } => {
    const c = crewById.get(crewId);
    const own = one<{ name?: string }>((c?.installation as never) ?? null)?.name ?? null;
    if (c?.installation_id) return { id: String(c.installation_id), name: own };
    return {
      id: defaultInst ? String(defaultInst.id) : null,
      name: defaultInst ? String(defaultInst.name) : null,
    };
  };

  // ---- Today's crew changes -------------------------------------------------
  // Approved early / late movements falling due — an OIM's explicit decision,
  // carried out whatever the schedule mode. Before the crew changes, so
  // someone leaving late is not taken off with their crew.
  summary.movesCarriedOut = await carryOutDueMoves(admin, tenantId, today);

  // One notice to the desk for the whole day's crew change, not one per crew.
  const dueToday = crewChangesDueToday(scheduled, today);
  const doneLines: string[] = [];
  let boardedToday = 0;
  let leftToday = 0;
  for (const due of dueToday) {
    const members = staffByCrew.get(due.crewId) ?? [];
    const inst = installationOf(due.crewId);
    if (!acts) continue;
    // Anyone an approved change moves off today's crew change stays put.
    const away = await movedAwayOn(admin, tenantId, today, due.action === "mobilise" ? "out" : "in");
    const moving = members.filter((m) => !away.has(String(m.profile_id)));
    if (due.action === "mobilise") {
      const n = await mobilise(admin, tenantId, due, moving, aboard, inst, today);
      summary.mobilised += n;
      boardedToday += n;
      doneLines.push(`${due.crewName} boarded ${inst.name ?? "the installation"} (${n})`);
    } else {
      const n = await demobilise(admin, tenantId, due, moving, today);
      summary.demobilised += n;
      leftToday += n;
      doneLines.push(`${due.crewName} demobilised (${n})`);
    }
  }
  if (dueToday.length && !acts) {
    summary.prompted += await notifyOnce(
      admin,
      {
        tenantId,
        profileIds: desk,
        category: "approval",
        title: `Crew change today: ${dueToday.map((d) => `${d.crewName} ${d.action === "mobilise" ? "+" : "−"}${d.count}`).join(", ")}`,
        body: `The schedule puts these crew changes on ${today}. Open them from "Crew changes due" on the dashboard.`,
        url: "/offshore?view=dashboard",
      },
      1,
    );
  } else if (doneLines.length) {
    await notifyOnce(
      admin,
      {
        tenantId,
        profileIds: desk,
        category: "general",
        title: `Crew change done: ${boardedToday} boarded, ${leftToday} left`,
        body: `${doneLines.join(" · ")}. Beds carry from the roster; adjust on the bed board if needed.`,
        url: "/offshore?view=dashboard",
      },
      1,
    );
  }

  // ---- Reminders three days before ----------------------------------------
  const ahead = crewChangesAhead(scheduled, today);
  const deskAhead: { a: (typeof ahead)[number]; count: number }[] = [];
  if (ahead.length) {
    const memberIds = ahead.flatMap((a) =>
      (staffByCrew.get(a.crewId) ?? []).map((m) => String(m.profile_id)),
    );
    const { data: people } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", memberIds);
    const nameOf = new Map(
      ((people ?? []) as Row[]).map((p) => [String(p.id), String(p.full_name || p.email || "your colleague")]),
    );
    for (const a of ahead) {
      const members = staffByCrew.get(a.crewId) ?? [];
      const inst = installationOf(a.crewId);
      const text = reminderForMember(a, inst.name);
      summary.reminded += await notifyOnce(
        admin,
        {
          tenantId,
          profileIds: members.map((m) => String(m.profile_id)),
          category: "general",
          ...text,
          url: "/dashboard",
        },
        7,
      );
      // Each back-to-back is told about their own opposite number.
      for (const m of members) {
        const b2b = (m.back_to_back_id as string | null) ?? null;
        if (!b2b) continue;
        const who = nameOf.get(String(m.profile_id)) ?? "your back-to-back";
        summary.reminded += await notifyOnce(
          admin,
          { tenantId, profileIds: [b2b], category: "general", ...reminderForBackToBack(a, who), url: "/dashboard" },
          7,
        );
      }
      const count =
        a.action === "mobilise"
          ? members.filter((m) => !aboard.has(String(m.profile_id))).length
          : members.filter((m) => aboard.has(String(m.profile_id))).length;
      deskAhead.push({ a, count });
    }
    // One heads-up to the desk per crew-change day, listing every crew.
    const byDate = new Map<string, { a: (typeof ahead)[number]; count: number }[]>();
    for (const x of deskAhead) byDate.set(x.a.date, [...(byDate.get(x.a.date) ?? []), x]);
    for (const list of byDate.values()) {
      summary.reminded += await notifyOnce(
        admin,
        {
          tenantId,
          profileIds: desk,
          category: "general",
          ...reminderForDeskDay(list, acts),
          url: "/offshore?view=crews",
        },
        7,
      );
    }
  }

  // ---- Stale trips ----------------------------------------------------------
  const cutoff = new Date(Date.parse(today + "T00:00:00Z") - STALE_FLAG_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: staleRows } = await admin
    .from("offshore_trips")
    .select("id, profile_id, person_name, status, mobilize_date")
    .eq("tenant_id", tenantId)
    .in("status", NOT_MOVED)
    .lte("mobilize_date", cutoff);
  const stale = (staleRows ?? []) as Row[];
  const { flag, cancel } = classifyStaleTrips(
    stale.map((t) => ({ id: String(t.id), status: String(t.status), mobilize_date: String(t.mobilize_date) })),
    today,
  );
  if (cancel.length) {
    const ids = cancel.map((t) => t.id);
    const { error } = await admin.from("offshore_trips").update({ status: "cancelled" }).in("id", ids);
    if (!error) {
      summary.staleCancelled = ids.length;
      const byId = new Map(stale.map((t) => [String(t.id), t]));
      for (const t of cancel) {
        const pid = (byId.get(t.id)?.profile_id as string | null) ?? null;
        if (!pid) continue;
        await notifyOnce(
          admin,
          {
            tenantId,
            profileIds: [pid],
            category: "general",
            title: `Offshore trip cancelled: mobilise date ${t.mobilize_date}`,
            body: `Nothing moved in the ${STALE_CANCEL_DAYS} days since the mobilise date, so the trip has been cancelled. Raise a new request if you still need to go.`,
            url: "/offshore",
          },
          7,
        );
      }
      await notifyOnce(
        admin,
        {
          tenantId,
          profileIds: desk,
          category: "approval",
          title: `${ids.length} stale offshore trip${ids.length === 1 ? "" : "s"} cancelled`,
          body: `Mobilise dates more than ${STALE_CANCEL_DAYS} days ago with no movement. The people have been told.`,
          url: "/offshore?view=trips",
        },
        1,
      );
    }
  }
  if (flag.length) {
    summary.staleFlagged = flag.length;
    await notifyOnce(
      admin,
      {
        tenantId,
        profileIds: desk,
        category: "approval",
        title: `${flag.length} offshore trip${flag.length === 1 ? "" : "s"} overdue with no movement`,
        body: `Mobilise dates more than ${STALE_FLAG_DAYS} days ago, still requested, cleared or manifested. Board, re-date or cancel them; after ${STALE_CANCEL_DAYS} days they are cancelled.`,
        url: "/offshore?view=trips",
      },
      7,
    );
  }

  // Crew change day manifests for the weeks ahead: one MOB and one DEMOB per
  // day and installation, filled with everyone due. Their own failure must
  // not undo the crew changes above.
  try {
    const made = await ensureDayManifests(admin, tenantId, { todayIso: today, defaultInstallationId: settings.defaultInstallationId });
    summary.dayManifests = made.created;
  } catch (e) {
    console.error(`offshore day manifests: tenant ${tenantId} failed:`, (e as Error).message);
  }

  // Visitors approved after their manifests were built join them; then the
  // dates move them: on board from departure, returned from the return date.
  // Manifests first, so today's travellers are still due when they are read.
  try {
    const horizonEnd = new Date(Date.parse(today + "T00:00:00Z") + (DAY_MANIFEST_HORIZON_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
    summary.visitorsManifested = await addVisitorsToDayManifests(admin, tenantId, today, horizonEnd, settings.defaultInstallationId);
    const moved = await advanceVisitorStatuses(admin, tenantId, today);
    summary.visitorsBoarded = moved.boarded;
    summary.visitorsReturned = moved.returned;
  } catch (e) {
    console.error(`offshore visitors: tenant ${tenantId} failed:`, (e as Error).message);
  }

  // Manifests whose day has passed: closed, with the travellers the records
  // confirm ticked as boarded.
  try {
    const shut = await closePastManifests(admin, tenantId, today);
    summary.manifestsClosed = shut.closed;
  } catch (e) {
    console.error(`offshore manifests close: tenant ${tenantId} failed:`, (e as Error).message);
  }

  // Today's meal sheet, from POB after the crew changes above, on every
  // installation whose beds and catering are run here (it has rooms). The
  // canteen adjusts it; running again keeps their ticks.
  try {
    const { data: roomInsts } = await admin.from("offshore_rooms").select("installation_id").eq("tenant_id", tenantId).eq("is_active", true);
    const insts = new Set(((roomInsts ?? []) as { installation_id: string | null }[]).map((r) => r.installation_id ?? settings.defaultInstallationId).filter(Boolean) as string[]);
    for (const inst of insts) {
      const res = await buildMealSheet(admin, tenantId, inst, today);
      if (res.ok) summary.mealSheets += 1;
      else if (!/No one is on board/.test(res.error)) console.error(`offshore meal sheet ${inst}: ${res.error}`);
    }
  } catch (e) {
    console.error(`offshore meal sheet: tenant ${tenantId} failed:`, (e as Error).message);
  }

  // Mondays: the next 14 days, in a few lines, to the OIM and the Campboss.
  if (new Date(today + "T00:00:00Z").getUTCDay() === 1) {
    try {
      summary.lookAheadSent = await sendLookAhead(admin, tenantId, today);
    } catch (e) {
      console.error(`offshore look-ahead: tenant ${tenantId} failed:`, (e as Error).message);
    }
  }

  return summary;
}

/** The Monday look-ahead message: crew changes, beds, the limit and what waits. */
async function sendLookAhead(admin: SupabaseClient, tenantId: string, today: string): Promise<number> {
  const la = await getLookAhead({ client: admin, tenantId, from: today, days: 14, serviceRole: true });
  const { data: roles } = await admin.from("profile_roles").select("profile_id").eq("tenant_id", tenantId).in("role", ["oim", "campboss"]);
  const to = (roles ?? []).map((r) => r.profile_id as string);
  const short = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const lines: string[] = [];
  for (const d of la.days.filter((x) => x.crewChange || x.flagged)) {
    const parts: string[] = [];
    if (d.crewsOut.length) parts.push(`${d.crewsOut.join(" & ")} in (${d.arrivals})`);
    if (d.crewsIn.length) parts.push(`${d.crewsIn.join(" & ")} out (${d.departures})`);
    if (d.bedsFree !== null && d.bedsFree < 0) parts.push(`${-d.bedsFree} beds short`);
    if (d.noBed > 0) parts.push(`${d.noBed} arrival(s) with no bed`);
    if (d.overIfApproved) parts.push(d.over ? `POB ${d.total}/${d.capacity} over the limit` : `${d.total + d.pending}/${d.capacity} if pending approved`);
    if (parts.length) lines.push(`${short(d.date)}: ${parts.join(", ")}`);
  }
  const tail = [
    la.todo.pending ? `${la.todo.pending} decision(s) waiting` : null,
    la.todo.noRoom ? `${la.todo.noRoom} on board with no room` : null,
    la.todo.draftManifests.count ? `${la.todo.draftManifests.count} manifest(s) still draft this week` : null,
  ].filter(Boolean);
  const body = [lines.length ? lines.join(" · ") : "No crew change in the next 14 days.", tail.join(" · ")].filter(Boolean).join(" — ");
  return notifyOnce(
    admin,
    {
      tenantId,
      profileIds: to,
      category: "general",
      title: `Offshore look-ahead — next 14 days${la.installation ? ` (${la.installation.name})` : ""}`,
      body,
      url: "/offshore/look-ahead",
    },
    5,
  );
}

/** Board everyone on the crew not yet aboard — the same rows `mobiliseCrew` writes. */
async function mobilise(
  admin: SupabaseClient,
  tenantId: string,
  due: CrewChangeDue,
  members: Row[],
  aboard: Set<string>,
  inst: { id: string | null; name: string | null },
  today: string,
): Promise<number> {
  const crew = members.length ? await cycleOf(admin, due.crewId) : null;
  const { fromIso, toIso } = crew
    ? scheduleWindow(crew, today)
    : { fromIso: due.hitchFrom, toIso: due.hitchTo };
  const nowIso = new Date().toISOString();
  const rows = members
    .filter((m) => !aboard.has(String(m.profile_id)))
    .map((m) => ({
      tenant_id: tenantId,
      profile_id: m.profile_id,
      installation_id: inst.id,
      crew_id: due.crewId,
      category: "staff",
      trip_type: "crew_change_out",
      mobilize_date: fromIso,
      demob_date: toIso,
      status: "onboard",
      hse_cleared_at: nowIso, // schedule-driven boarding is the clearance gate
      room_id: (m.fixed_room_id as string | null) ?? null,
      bed_no: (m.fixed_bed as string | null) ?? null,
      lifeboat: (m.lifeboat as string | null) ?? null,
      mode: "auto",
    }));
  if (rows.length === 0) return 0;
  const { error } = await admin.from("offshore_trips").insert(rows);
  if (error) {
    console.error(`offshore schedule: mobilise ${due.crewName} failed:`, error.message);
    return 0;
  }
  for (const r of rows) aboard.add(String(r.profile_id));
  await notifyOnce(
    admin,
    {
      tenantId,
      profileIds: rows.map((r) => String(r.profile_id)),
      category: "general",
      title: `Crew mobilised: ${due.crewName} is on board`,
      body: `The schedule has boarded you on ${inst.name ?? "the installation"} for the hitch ${fromIso} → ${toIso}.`,
      url: "/offshore",
    },
    1,
  );
  return rows.length;
}

/** Take everyone on the crew off board at hitch end — what `demobiliseCrew` does. */
async function demobilise(
  admin: SupabaseClient,
  tenantId: string,
  due: CrewChangeDue,
  members: Row[],
  today: string,
): Promise<number> {
  const ids = members.map((m) => String(m.profile_id));
  if (ids.length === 0) return 0;
  const { data: affected } = await admin
    .from("offshore_trips")
    .select("id, profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "onboard")
    .in("profile_id", ids);
  const tripIds = (affected ?? []).map((t) => String(t.id));
  if (tripIds.length === 0) return 0;
  const { error } = await admin
    .from("offshore_trips")
    .update({ status: "demobilised", demob_date: today })
    .in("id", tripIds);
  if (error) {
    console.error(`offshore schedule: demobilise ${due.crewName} failed:`, error.message);
    return 0;
  }
  await notifyOnce(
    admin,
    {
      tenantId,
      profileIds: (affected ?? []).map((t) => String(t.profile_id)),
      category: "general",
      title: `Crew demobilised: ${due.crewName} is off board`,
      body: `The schedule has taken you off board at the end of your hitch on ${today}.`,
      url: "/offshore",
    },
    1,
  );
  return tripIds.length;
}

async function cycleOf(admin: SupabaseClient, crewId: string) {
  const { data } = await admin
    .from("offshore_crews")
    .select("offshore_days, onshore_days, cycle_start_date")
    .eq("id", crewId)
    .maybeSingle();
  return data
    ? {
        offshore_days: Number(data.offshore_days),
        onshore_days: Number(data.onshore_days),
        cycle_start_date: (data.cycle_start_date as string | null) ?? null,
      }
    : null;
}
