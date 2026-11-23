import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { one } from "./_shared";
import {
  DAY_MANIFEST_HORIZON_DAYS,
  dayManifestTitle,
  daySeats,
  dueForDay,
  manifestDays,
  sharedTransport,
  visitorManifestTitle,
  visitorsDue,
  type DayCrew,
  type DayOnboard,
  type DayStaff,
  type DayVisit,
  type DayTrip,
  type DuePax,
} from "./day-manifests";
import type { Direction } from "./manifest-plan";
import { visitorMoves } from "./visitor-moves";
import type { DayMove, MoveKind } from "./movement-change";
import { confirmedTravellers, type ClosePax, type CloseTrip, type CloseVisit } from "./manifest-close";

type Row = Record<string, any>;
const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const PAGE = 1000;

async function allRows(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

interface DayInputs {
  crews: DayCrew[];
  staff: DayStaff[];
  onboard: DayOnboard[];
  visits: DayVisit[];
  moves: DayMove[];
  trips: DayTrip[];
  installationName: Map<string, string>;
}

/** The tenant's default installation, from the offshore module settings. */
export async function offshoreDefaultInstallation(client: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data } = await client
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("tenant_id", tenantId)
    .eq("services_catalog.slug", "offshore")
    .maybeSingle();
  const s = ((data as Row | null)?.settings ?? {}) as Row;
  return (s.default_installation_id as string | null) ?? null;
}

/** Crews, roster, who is aboard and the visitor bookings, for the days `fromIso`..`toIso`. */
async function loadDayInputs(client: SupabaseClient, tenantId: string, fromIso: string, toIso: string): Promise<DayInputs> {
  const [crews, staff, onboard, visits, installations, moves, approvedTrips] = await Promise.all([
    allRows((a, b) =>
      client
        .from("offshore_crews")
        .select("id, name, offshore_days, onshore_days, cycle_start_date, installation_id, transport_mode")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .not("cycle_start_date", "is", null)
        .order("name")
        .range(a, b),
    ),
    allRows((a, b) =>
      client
        .from("offshore_staff")
        .select("profile_id, crew_id, position, is_rotational, profile:profiles!offshore_staff_profile_id_fkey(full_name, email)")
        .eq("tenant_id", tenantId)
        .order("profile_id")
        .range(a, b),
    ),
    allRows((a, b) =>
      client
        .from("offshore_trips")
        .select("id, profile_id, crew_id, installation_id, demob_date, person_name, profile:profiles!offshore_trips_profile_id_fkey(full_name)")
        .eq("tenant_id", tenantId)
        .eq("status", "onboard")
        .order("id")
        .range(a, b),
    ),
    allRows((a, b) =>
      client
        .from("offshore_visit_requests")
        .select("id, visitor_name, status, installation_id, depart_date, return_date")
        .eq("tenant_id", tenantId)
        .in("status", ["approved", "onboard"])
        .or(`and(depart_date.gte.${fromIso},depart_date.lte.${toIso}),and(return_date.gte.${fromIso},return_date.lte.${toIso})`)
        .order("id")
        .range(a, b),
    ),
    allRows((a, b) => client.from("offshore_installations").select("id, name").eq("tenant_id", tenantId).order("id").range(a, b)),
    // Approved movement changes touching the window, either end.
    allRows((a, b) =>
      client
        .from("offshore_movement_requests")
        .select("profile_id, kind, scheduled_date, requested_date, installation_id, profile:profiles!offshore_movement_requests_profile_id_fkey(full_name, email)")
        .eq("tenant_id", tenantId)
        .eq("status", "approved")
        .or(`and(scheduled_date.gte.${fromIso},scheduled_date.lte.${toIso}),and(requested_date.gte.${fromIso},requested_date.lte.${toIso})`)
        .order("id")
        .range(a, b),
    ),
    // One-off trips the OIM approved (HSE-cleared), travelling in the window.
    allRows((a, b) =>
      client
        .from("offshore_trips")
        .select("id, profile_id, installation_id, mobilize_date, demob_date, person_name, profile:profiles!offshore_trips_profile_id_fkey(full_name)")
        .eq("tenant_id", tenantId)
        .in("status", ["hse_cleared", "manifested"])
        .or(`and(mobilize_date.gte.${fromIso},mobilize_date.lte.${toIso}),and(demob_date.gte.${fromIso},demob_date.lte.${toIso})`)
        .order("id")
        .range(a, b),
    ),
  ]);
  const positionOf = new Map(staff.map((s) => [s.profile_id as string, (s.position as string | null) ?? null]));

  return {
    crews: crews.map((c) => ({
      id: c.id,
      name: c.name,
      offshore_days: Number(c.offshore_days),
      onshore_days: Number(c.onshore_days),
      cycle_start_date: c.cycle_start_date ?? null,
      installation_id: c.installation_id ?? null,
      transport_mode: c.transport_mode ?? null,
    })),
    staff: staff
      .filter((s) => s.profile_id)
      .map((s) => {
        const p = one<{ full_name?: string; email?: string }>(s.profile);
        return {
          profile_id: s.profile_id,
          name: p?.full_name || p?.email || "Crew member",
          position: s.position ?? null,
          crew_id: s.crew_id ?? null,
          is_rotational: s.is_rotational ?? null,
        };
      }),
    onboard: onboard.map((o) => ({
      profile_id: o.profile_id ?? null,
      name: one<{ full_name?: string }>(o.profile)?.full_name || o.person_name || "On board",
      crew_id: o.crew_id ?? null,
      installation_id: o.installation_id ?? null,
      demob_date: o.demob_date ?? null,
    })),
    visits: visits.map((v) => ({
      id: v.id,
      visitor_name: v.visitor_name,
      status: v.status,
      installation_id: v.installation_id ?? null,
      depart_date: v.depart_date,
      return_date: v.return_date ?? null,
    })),
    moves: moves.map((m) => {
      const p = one<{ full_name?: string; email?: string }>(m.profile);
      return {
        profile_id: m.profile_id as string,
        name: p?.full_name || p?.email || "Crew member",
        position: positionOf.get(m.profile_id as string) ?? null,
        kind: m.kind as MoveKind,
        scheduled_date: (m.scheduled_date as string | null) ?? null,
        requested_date: m.requested_date as string,
        installation_id: (m.installation_id as string | null) ?? null,
      };
    }),
    trips: approvedTrips.map((t) => ({
      id: t.id as string,
      profile_id: (t.profile_id as string | null) ?? null,
      name: one<{ full_name?: string }>(t.profile)?.full_name || (t.person_name as string) || "Traveller",
      installation_id: (t.installation_id as string | null) ?? null,
      mobilize_date: t.mobilize_date as string,
      demob_date: (t.demob_date as string | null) ?? null,
    })),
    installationName: new Map(installations.map((i) => [i.id as string, i.name as string])),
  };
}

const paxKey = (p: { profile_id: string | null; visit_request_id: string | null; name?: string; person_name?: string }) =>
  p.profile_id ? `p:${p.profile_id}` : p.visit_request_id ? `v:${p.visit_request_id}` : `n:${(p.name ?? p.person_name ?? "").toLowerCase()}`;

function paxRows(tenantId: string, manifestId: string, pax: { profile_id: string | null; visit_request_id: string | null; name: string; position: string | null }[]) {
  return pax.map((p) => ({
    tenant_id: tenantId,
    manifest_id: manifestId,
    profile_id: p.profile_id,
    visit_request_id: p.visit_request_id,
    person_name: p.name,
    position: p.position,
  }));
}

export interface DayManifestRun {
  /** Crew change days (per installation) in the horizon. */
  days: number;
  /** Day manifests created now. */
  created: number;
  /** Per-crew drafts folded into a day manifest and cancelled. */
  superseded: number;
}

/**
 * Make sure every crew change day from `todayIso` for the horizon has its
 * two day manifests (MOB and DEMOB) per installation, each filled with
 * everyone due. A day manifest that already exists is left as the desk has
 * it; "Refresh from schedule" adds anyone who became due since.
 *
 * Upcoming per-crew drafts for the same day and direction are folded in:
 * their passengers join the day manifest and the draft is cancelled, so a
 * crew change is not manifested twice.
 */
export async function ensureDayManifests(
  client: SupabaseClient,
  tenantId: string,
  opts: { todayIso: string; horizonDays?: number; defaultInstallationId?: string | null },
): Promise<DayManifestRun> {
  const from = opts.todayIso;
  const horizon = opts.horizonDays ?? DAY_MANIFEST_HORIZON_DAYS;
  const to = addDays(from, horizon - 1);
  const defaultInstallationId = opts.defaultInstallationId ?? null;
  const inputs = await loadDayInputs(client, tenantId, from, to);
  const days = manifestDays({ crews: inputs.crews, staff: inputs.staff, visits: inputs.visits, moves: inputs.moves, trips: inputs.trips, fromIso: from, days: horizon, defaultInstallationId });
  const run: DayManifestRun = { days: days.length, created: 0, superseded: 0 };
  if (days.length === 0) return run;

  const [existing, drafts] = await Promise.all([
    allRows((a, b) =>
      client
        .from("offshore_manifests")
        .select("scheduled_date, direction, installation_id")
        .eq("tenant_id", tenantId)
        .eq("kind", "day")
        .neq("status", "cancelled")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .order("scheduled_date")
        .range(a, b),
    ),
    allRows((a, b) =>
      client
        .from("offshore_manifests")
        .select("id, scheduled_date, direction, installation_id, offshore_manifest_pax(profile_id, visit_request_id, person_name, position, no_show)")
        .eq("tenant_id", tenantId)
        .eq("kind", "crew")
        .eq("status", "draft")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .order("scheduled_date")
        .range(a, b),
    ),
  ]);
  const have = new Set(existing.map((m) => `${m.scheduled_date}|${m.direction}|${m.installation_id ?? ""}`));

  for (const day of days) {
    for (const direction of day.directions) {
      if (have.has(`${day.date}|${direction}|${day.installationId ?? ""}`)) continue;

      const due: DuePax[] = dueForDay({ date: day.date, direction, installationId: day.installationId, ...inputs, defaultInstallationId });
      const seen = new Set(due.map(paxKey));
      const folded = drafts.filter(
        (d) => d.scheduled_date === day.date && d.direction === direction && (d.installation_id == null || d.installation_id === day.installationId),
      );
      const carried = folded
        .flatMap((d) => (d.offshore_manifest_pax ?? []) as Row[])
        .filter((p) => !p.no_show)
        .map((p) => ({ profile_id: p.profile_id ?? null, visit_request_id: p.visit_request_id ?? null, name: p.person_name as string, position: p.position ?? null }))
        .filter((p) => {
          const k = paxKey(p);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      const pax = [...due, ...carried];
      const crewsThisWay = direction === "out" ? day.out : day.in;

      const { data: manifest, error } = await client
        .from("offshore_manifests")
        .insert({
          tenant_id: tenantId,
          kind: "day",
          title: (day.crewDay ? dayManifestTitle : visitorManifestTitle)(
            day.date,
            direction,
            day.installationId ? inputs.installationName.get(day.installationId) ?? null : null,
          ),
          crew_id: null,
          installation_id: day.installationId,
          trip_type: day.crewDay ? (direction === "out" ? "crew_change_out" : "crew_change_in") : direction === "out" ? "visitor_out" : "visitor_in",
          direction,
          // Boat by default: a visitor-only day, or crews that name none or differ.
          transport_mode: (day.crewDay ? sharedTransport(crewsThisWay.length ? crewsThisWay : [...day.out, ...day.in]) : null) ?? "boat",
          seat_capacity: daySeats(pax.length),
          scheduled_date: day.date,
          status: "draft",
        })
        .select("id")
        .maybeSingle();
      if (error || !manifest) {
        // Another run made it first (the unique index); anything else is logged.
        if (!/offshore_manifests_day_run|duplicate key/.test(error?.message ?? "")) console.error(`day manifest ${day.date} ${direction}: ${error?.message}`);
        continue;
      }
      if (pax.length) {
        const { error: paxErr } = await client.from("offshore_manifest_pax").insert(paxRows(tenantId, manifest.id as string, pax));
        if (paxErr) console.error(`day manifest ${day.date} ${direction} pax: ${paxErr.message}`);
      }
      run.created += 1;
      have.add(`${day.date}|${direction}|${day.installationId ?? ""}`);

      if (folded.length) {
        await client.from("offshore_manifests").update({ status: "cancelled" }).in("id", folded.map((d) => d.id as string));
        run.superseded += folded.length;
      }
    }
  }
  return run;
}

/**
 * Add to a day manifest anyone the schedule now says is due who is not on it
 * yet (someone joined a crew, a visit was approved). Nobody is taken off:
 * the desk removes people by hand.
 */
export async function refreshDayManifestPax(
  client: SupabaseClient,
  tenantId: string,
  manifestId: string,
  defaultInstallationId: string | null,
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const { data: m } = await client
    .from("offshore_manifests")
    .select("id, kind, status, scheduled_date, direction, installation_id, offshore_manifest_pax(profile_id, visit_request_id, person_name)")
    .eq("id", manifestId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!m) return { ok: false, error: "Manifest not found." };
  if (m.kind !== "day") return { ok: false, error: "Only a crew change day manifest refreshes from the schedule." };
  if (m.status !== "draft" && m.status !== "approved") return { ok: false, error: "This manifest is closed." };

  const date = m.scheduled_date as string;
  const inputs = await loadDayInputs(client, tenantId, date, date);
  const due = dueForDay({ date, direction: m.direction as Direction, installationId: (m.installation_id as string | null) ?? null, ...inputs, defaultInstallationId });
  const onIt = new Set(((m.offshore_manifest_pax ?? []) as Row[]).map((p) => paxKey({ profile_id: p.profile_id ?? null, visit_request_id: p.visit_request_id ?? null, person_name: p.person_name })));
  const missing = due.filter((p) => !onIt.has(paxKey(p)));
  if (missing.length) {
    const { error } = await client.from("offshore_manifest_pax").insert(paxRows(tenantId, manifestId, missing));
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, added: missing.length };
}

/**
 * Put approved visitors on the open day manifests of their travel dates
 * between `fromIso` and `toIso`: the MOB on the departure date, the DEMOB on
 * the return date. A manifest built before the visit was approved does not
 * have them yet. Only visitors are added; the desk's own edits stand.
 */
export async function addVisitorsToDayManifests(
  client: SupabaseClient,
  tenantId: string,
  fromIso: string,
  toIso: string,
  defaultInstallationId: string | null,
): Promise<number> {
  const [inputs, manifests] = await Promise.all([
    loadDayInputs(client, tenantId, fromIso, toIso),
    allRows((a, b) =>
      client
        .from("offshore_manifests")
        .select("id, scheduled_date, direction, installation_id, seat_capacity, offshore_manifest_pax(profile_id, visit_request_id, person_name)")
        .eq("tenant_id", tenantId)
        .eq("kind", "day")
        .in("status", ["draft", "approved"])
        .gte("scheduled_date", fromIso)
        .lte("scheduled_date", toIso)
        .order("scheduled_date")
        .range(a, b),
    ),
  ]);
  if (inputs.visits.length === 0) return 0;
  let added = 0;
  for (const m of manifests) {
    const due = visitorsDue(inputs.visits, m.scheduled_date as string, m.direction as Direction, (m.installation_id as string | null) ?? null, defaultInstallationId);
    if (due.length === 0) continue;
    const pax = (m.offshore_manifest_pax ?? []) as Row[];
    const onIt = new Set(pax.map((p) => paxKey({ profile_id: p.profile_id ?? null, visit_request_id: p.visit_request_id ?? null, person_name: p.person_name })));
    const missing = due.filter((p) => !onIt.has(paxKey(p)));
    if (missing.length === 0) continue;
    const { error } = await client.from("offshore_manifest_pax").insert(paxRows(tenantId, m.id as string, missing));
    if (error) {
      console.error(`visitors onto manifest ${m.id}: ${error.message}`);
      continue;
    }
    added += missing.length;
    const seats = daySeats(pax.length + missing.length);
    if (seats > Number(m.seat_capacity ?? 0)) await client.from("offshore_manifests").update({ seat_capacity: seats }).eq("id", m.id as string);
  }
  return added;
}

/**
 * Put just-approved visits on the manifests of their travel dates, making a
 * manifest for a date that has none yet (a visitor movement, or a crew change
 * beyond the nightly horizon). Dates already past are left alone.
 */
export async function placeVisitsOnManifests(client: SupabaseClient, tenantId: string, visitIds: string[], todayIso: string): Promise<number> {
  if (visitIds.length === 0) return 0;
  const { data } = await client
    .from("offshore_visit_requests")
    .select("depart_date, return_date, status")
    .eq("tenant_id", tenantId)
    .in("id", visitIds)
    .in("status", ["approved", "onboard"]);
  const dates = new Set<string>();
  for (const v of (data ?? []) as Row[]) {
    if (v.status === "approved" && v.depart_date >= todayIso) dates.add(v.depart_date as string);
    if (v.return_date && v.return_date >= todayIso) dates.add(v.return_date as string);
  }
  if (dates.size === 0) return 0;
  const defaultInstallationId = await offshoreDefaultInstallation(client, tenantId);
  let added = 0;
  for (const date of [...dates].sort()) {
    await ensureDayManifests(client, tenantId, { todayIso: date, horizonDays: 1, defaultInstallationId });
    added += await addVisitorsToDayManifests(client, tenantId, date, date, defaultInstallationId);
  }
  return added;
}

/**
 * Move visitors' status with their dates: on board from the departure date,
 * returned (bed freed) from the return date. A visitor the desk marked a
 * no-show on a MOB manifest is not boarded.
 */
export async function advanceVisitorStatuses(client: SupabaseClient, tenantId: string, todayIso: string): Promise<{ boarded: number; returned: number }> {
  const visits = await allRows((a, b) =>
    client
      .from("offshore_visit_requests")
      .select("id, status, depart_date, return_date, is_casual")
      .eq("tenant_id", tenantId)
      .in("status", ["approved", "onboard"])
      .lte("depart_date", todayIso)
      .order("id")
      .range(a, b),
  );
  if (visits.length === 0) return { boarded: 0, returned: 0 };
  const { data: flagged } = await client
    .from("offshore_manifest_pax")
    .select("visit_request_id, manifest:offshore_manifests!inner(direction)")
    .eq("tenant_id", tenantId)
    .eq("no_show", true)
    .eq("manifest.direction", "out")
    .in("visit_request_id", visits.map((v) => v.id as string));
  const noShows = new Set(((flagged ?? []) as Row[]).map((r) => r.visit_request_id as string));
  const { board, ret } = visitorMoves(visits as never, todayIso, noShows);

  if (board.length) {
    const { error } = await client.from("offshore_visit_requests").update({ status: "onboard" }).in("id", board).eq("status", "approved");
    if (!error) await client.from("offshore_bed_allocations").update({ status: "checked_in" }).in("visit_request_id", board).eq("status", "reserved");
  }
  if (ret.length) {
    const { error } = await client.from("offshore_visit_requests").update({ status: "returned" }).in("id", ret).in("status", ["approved", "onboard"]);
    if (!error) await client.from("offshore_bed_allocations").update({ status: "checked_out" }).in("visit_request_id", ret).neq("status", "checked_out");
  }
  return { boarded: board.length, returned: ret.length };
}

/**
 * Who the schedule moves on each day from `fromIso` to `toIso`, per
 * installation: the same lists the day manifests are built from (crews by
 * their rotation, approved date changes, booked visitors, non-rotational
 * staff on their demob date). For planning ahead.
 */
export async function dueByDay(
  client: SupabaseClient,
  tenantId: string,
  fromIso: string,
  toIso: string,
  defaultInstallationId: string | null,
): Promise<{
  days: { date: string; installationId: string | null; out: DuePax[]; in: DuePax[] }[];
  crews: DayCrew[];
  staff: DayStaff[];
}> {
  const inputs = await loadDayInputs(client, tenantId, fromIso, toIso);
  const n = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000) + 1;
  const days = manifestDays({ crews: inputs.crews, staff: inputs.staff, visits: inputs.visits, moves: inputs.moves, trips: inputs.trips, fromIso, days: n, defaultInstallationId });
  return {
    days: days.map((d) => ({
      date: d.date,
      installationId: d.installationId,
      out: d.directions.includes("out") ? dueForDay({ date: d.date, direction: "out", installationId: d.installationId, ...inputs, defaultInstallationId }) : [],
      in: d.directions.includes("in") ? dueForDay({ date: d.date, direction: "in", installationId: d.installationId, ...inputs, defaultInstallationId }) : [],
    })),
    crews: inputs.crews,
    staff: inputs.staff,
  };
}

type TripLite = { profile_id: string | null; person_name: string | null; name: string; installation_id: string | null; mobilize_date: string; demob_date: string | null };

async function tripLite(client: SupabaseClient, tenantId: string, tripId: string): Promise<TripLite | null> {
  const { data: t } = await client
    .from("offshore_trips")
    .select("profile_id, person_name, installation_id, mobilize_date, demob_date, profile:profiles!offshore_trips_profile_id_fkey(full_name)")
    .eq("tenant_id", tenantId)
    .eq("id", tripId)
    .maybeSingle();
  if (!t) return null;
  return {
    profile_id: (t.profile_id as string | null) ?? null,
    person_name: (t.person_name as string | null) ?? null,
    name: one<{ full_name?: string }>(t.profile as never)?.full_name || (t.person_name as string) || "Traveller",
    installation_id: (t.installation_id as string | null) ?? null,
    mobilize_date: t.mobilize_date as string,
    demob_date: (t.demob_date as string | null) ?? null,
  };
}

/** The open day manifests of one date and direction on the trip's installation. */
async function openDayManifests(client: SupabaseClient, tenantId: string, date: string, direction: Direction, installationId: string | null) {
  let q = client
    .from("offshore_manifests")
    .select("id, seat_capacity, offshore_manifest_pax(id, profile_id, person_name, boarded)")
    .eq("tenant_id", tenantId)
    .eq("kind", "day")
    .eq("scheduled_date", date)
    .eq("direction", direction)
    .in("status", ["draft", "approved"]);
  q = installationId ? q.eq("installation_id", installationId) : q.is("installation_id", null);
  const { data } = await q;
  return (data ?? []) as Row[];
}

const samePerson = (p: Row, t: TripLite) =>
  t.profile_id ? p.profile_id === t.profile_id : !p.profile_id && (p.person_name ?? "").toLowerCase() === t.name.toLowerCase();

/**
 * A trip the OIM has just approved goes on the manifests of its travel
 * dates: MOB on the mobilise date, DEMOB on the demob date (a manifest is
 * made for a date that has none). Dates already past are left alone.
 */
export async function placeTripOnManifests(client: SupabaseClient, tenantId: string, tripId: string, todayIso: string): Promise<number> {
  const t = await tripLite(client, tenantId, tripId);
  if (!t) return 0;
  const defaultInstallationId = await offshoreDefaultInstallation(client, tenantId);
  const inst = t.installation_id ?? defaultInstallationId;
  let added = 0;
  for (const [date, direction] of [[t.mobilize_date, "out"], [t.demob_date, "in"]] as [string | null, Direction][]) {
    if (!date || date < todayIso) continue;
    await ensureDayManifests(client, tenantId, { todayIso: date, horizonDays: 1, defaultInstallationId });
    for (const m of await openDayManifests(client, tenantId, date, direction, inst)) {
      const pax = (m.offshore_manifest_pax ?? []) as Row[];
      if (pax.some((p) => samePerson(p, t))) continue;
      const { data: staff } = t.profile_id
        ? await client.from("offshore_staff").select("position").eq("profile_id", t.profile_id).maybeSingle()
        : { data: null };
      const { error } = await client.from("offshore_manifest_pax").insert({
        tenant_id: tenantId,
        manifest_id: m.id,
        profile_id: t.profile_id,
        person_name: t.name,
        position: (staff?.position as string | null) ?? null,
      });
      if (!error) {
        added += 1;
        const seats = daySeats(pax.length + 1);
        if (seats > Number(m.seat_capacity ?? 0)) await client.from("offshore_manifests").update({ seat_capacity: seats }).eq("id", m.id as string);
      }
    }
  }
  return added;
}

/**
 * A trip cancelled or rejected comes off the manifests of its travel dates
 * that are still ahead (or today, if not yet boarded).
 */
export async function removeTripFromManifests(client: SupabaseClient, tenantId: string, tripId: string, todayIso: string): Promise<number> {
  const t = await tripLite(client, tenantId, tripId);
  if (!t) return 0;
  const defaultInstallationId = await offshoreDefaultInstallation(client, tenantId);
  const inst = t.installation_id ?? defaultInstallationId;
  let removed = 0;
  for (const [date, direction] of [[t.mobilize_date, "out"], [t.demob_date, "in"]] as [string | null, Direction][]) {
    if (!date || date < todayIso) continue;
    for (const m of await openDayManifests(client, tenantId, date, direction, inst)) {
      const ids = ((m.offshore_manifest_pax ?? []) as Row[]).filter((p) => !p.boarded && samePerson(p, t)).map((p) => p.id as string);
      if (!ids.length) continue;
      const { error } = await client.from("offshore_manifest_pax").delete().in("id", ids);
      if (!error) removed += ids.length;
    }
  }
  return removed;
}

/**
 * Close every manifest whose date has passed (draft, approved or locked →
 * completed), ticking as boarded the passengers whose travel the trips and
 * visits confirm. Today's manifests stay open.
 */
export async function closePastManifests(client: SupabaseClient, tenantId: string, todayIso: string): Promise<{ closed: number; boarded: number }> {
  const manifests = await allRows((a, b) =>
    client
      .from("offshore_manifests")
      .select("id, scheduled_date, direction, offshore_manifest_pax(id, profile_id, visit_request_id, boarded, no_show)")
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "approved", "locked"])
      .lt("scheduled_date", todayIso)
      .order("scheduled_date")
      .range(a, b),
  );
  if (manifests.length === 0) return { closed: 0, boarded: 0 };

  const profileIds = [...new Set(manifests.flatMap((m) => ((m.offshore_manifest_pax ?? []) as Row[]).map((p) => p.profile_id).filter(Boolean)))] as string[];
  const visitIds = [...new Set(manifests.flatMap((m) => ((m.offshore_manifest_pax ?? []) as Row[]).map((p) => p.visit_request_id).filter(Boolean)))] as string[];
  const [trips, visits] = await Promise.all([
    profileIds.length
      ? allRows((a, b) =>
          client
            .from("offshore_trips")
            .select("profile_id, status, mobilize_date, demob_date")
            .eq("tenant_id", tenantId)
            .in("profile_id", profileIds)
            .in("status", ["onboard", "demobilised"])
            .order("id")
            .range(a, b),
        )
      : Promise.resolve([] as Row[]),
    visitIds.length
      ? allRows((a, b) =>
          client.from("offshore_visit_requests").select("id, status, depart_date, return_date").eq("tenant_id", tenantId).in("id", visitIds).order("id").range(a, b),
        )
      : Promise.resolve([] as Row[]),
  ]);

  let boarded = 0;
  let closed = 0;
  for (const m of manifests) {
    const ids = confirmedTravellers({
      date: m.scheduled_date as string,
      direction: m.direction as "out" | "in",
      pax: (m.offshore_manifest_pax ?? []) as ClosePax[],
      trips: trips as CloseTrip[],
      visits: visits as CloseVisit[],
    });
    if (ids.length) {
      const { error } = await client.from("offshore_manifest_pax").update({ boarded: true }).in("id", ids);
      if (!error) boarded += ids.length;
    }
    const { error } = await client.from("offshore_manifests").update({ status: "completed" }).eq("id", m.id as string);
    if (!error) closed += 1;
  }
  return { closed, boarded };
}
