import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { one } from "./_shared";
import { dueByDay, offshoreDefaultInstallation } from "./day-manifest-run";
import { nextCrewChangeDate } from "./manifest-plan";
import { MOVE_KIND_LABEL, type MoveKind } from "./movement-change";
import { getPobOutlook } from "./pob-outlook-data";
import { nextDays, planBeds, type ArrivalPlan, type PlanArrival, type PlanRoom } from "./look-ahead-plan";

/**
 * The Look-ahead: what the coming days need, for the OIM and the Campboss —
 * POB against the limit, beds, who arrives and leaves, the manifests, and the
 * decisions and clean-up that should happen first.
 *
 * Runs on the caller's client: a manager's session, or the service role for
 * the Monday message (every read here names the tenant either way).
 */

type Row = Record<string, any>;

export interface LookAheadDay {
  date: string;
  weekday: string;
  total: number;
  capacity: number;
  pending: number;
  over: boolean;
  overIfApproved: boolean;
  /** Free beds = usable beds − POB; negative means short; null where beds are not managed here. */
  bedsFree: number | null;
  /** Arrivals the bed plan found no bed for. */
  noBed: number;
  arrivals: number;
  departures: number;
  /** Crews changing out / in that day. */
  crewsOut: string[];
  crewsIn: string[];
  crewChange: boolean;
  flagged: boolean;
}

export interface LookAheadPending {
  kind: "visit" | "trip" | "move";
  name: string;
  date: string;
  what: string;
}

export interface LookAheadDetail {
  date: string;
  arrivals: (ArrivalPlan & { reason: string })[];
  departures: { name: string; reason: string }[];
  manifests: { direction: "out" | "in"; status: string; pax: number; transport: string | null; id: string }[];
  pending: LookAheadPending[];
}

export interface LookAhead {
  from: string;
  to: string;
  installation: { id: string; name: string; capacity: number } | null;
  installations: { id: string; name: string }[];
  usableBeds: number;
  days: LookAheadDay[];
  selected: LookAheadDetail | null;
  kpis: { overDays: number; shortDays: number; pending: number; crewChanges: number; peak: number; peakDate: string | null };
  todo: {
    noBed: { count: number; dates: string[] };
    overstayerBlocks: { count: number; cabins: string[] };
    pending: number;
    pendingOverDates: string[];
    draftManifests: { count: number; dates: string[] };
    noRoom: number;
    openEnded: number;
    overstaying: number;
  };
  pendingList: LookAheadPending[];
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (iso: string) => WEEKDAY[new Date(iso + "T00:00:00Z").getUTCDay()];

export async function getLookAhead(input: {
  client: SupabaseClient;
  tenantId: string;
  from: string;
  days: number;
  installationId?: string | null;
  selectedDate?: string | null;
  /** The outlook reads through RLS for a user; the service role passes the tenant. */
  serviceRole?: boolean;
}): Promise<LookAhead> {
  const { client, tenantId, from } = input;
  const dates = nextDays(from, input.days);
  const to = dates[dates.length - 1];
  const t = <Q,>(q: Q): Q => (q as unknown as { eq: (c: string, v: string) => Q }).eq("tenant_id", tenantId);

  const defaultInst = await offshoreDefaultInstallation(client, tenantId);
  const [outlook, due, { data: instRows }, { data: roomRows }, { data: onboardRows }, { data: staffRows }, { data: adhocRows }, { data: visitRows }, { data: allocRows }, { data: manifestRows }, { data: pendVisits }, { data: pendTrips }, { data: pendMoves }] =
    await Promise.all([
      getPobOutlook(from, to, input.serviceRole ? { client, tenantId } : undefined),
      dueByDay(client, tenantId, from, to, defaultInst),
      t(client.from("offshore_installations").select("id, name, pob_capacity").eq("is_active", true)).order("name"),
      t(client.from("offshore_rooms").select("id, block, room_number, bed_count, status, installation_id").eq("is_active", true)),
      t(
        client
          .from("offshore_trips")
          .select("id, profile_id, room_id, demob_date, installation_id, person_name, person:profiles!offshore_trips_profile_id_fkey(full_name)")
          .eq("status", "onboard"),
      ),
      t(client.from("offshore_staff").select("profile_id, crew_id, fixed_room_id, is_rotational")),
      // Approved one-off trips arriving in the window (not on a rotation).
      t(
        client
          .from("offshore_trips")
          .select("id, profile_id, installation_id, mobilize_date, demob_date, person_name, person:profiles!offshore_trips_profile_id_fkey(full_name)")
          .in("status", ["hse_cleared", "manifested"])
          .gte("mobilize_date", from)
          .lte("mobilize_date", to),
      ),
      t(client.from("offshore_visit_requests").select("id, return_date").in("status", ["approved", "onboard"]).lte("depart_date", to)),
      t(client.from("offshore_bed_allocations").select("visit_request_id, room_id").neq("status", "checked_out")),
      t(
        client
          .from("offshore_manifests")
          .select("id, scheduled_date, direction, status, transport_mode, installation_id, offshore_manifest_pax(count)")
          .eq("kind", "day")
          .neq("status", "cancelled")
          .gte("scheduled_date", from)
          .lte("scheduled_date", to),
      ),
      t(client.from("offshore_visit_requests").select("visitor_name, depart_date, installation_id").eq("status", "requested").gte("depart_date", from).lte("depart_date", to)),
      t(
        client
          .from("offshore_trips")
          .select("mobilize_date, installation_id, person_name, person:profiles!offshore_trips_profile_id_fkey(full_name)")
          .eq("status", "requested")
          .gte("mobilize_date", from)
          .lte("mobilize_date", to),
      ),
      t(
        client
          .from("offshore_movement_requests")
          .select("kind, scheduled_date, requested_date, installation_id, person:profiles!offshore_movement_requests_profile_id_fkey(full_name)")
          .in("status", ["pending_endorsement", "pending"]),
      ),
    ]);

  const installations = ((instRows ?? []) as Row[]).map((i) => ({ id: i.id as string, name: i.name as string, capacity: Number(i.pob_capacity ?? 0) }));
  const installation =
    installations.find((i) => i.id === input.installationId) ?? installations.find((i) => i.id === defaultInst) ?? installations[0] ?? null;
  const instId = installation?.id ?? null;
  const here = (id: string | null | undefined) => (id ?? defaultInst) === instId;

  // Rooms and usable beds on this installation.
  const rooms: PlanRoom[] = ((roomRows ?? []) as Row[])
    .filter((r) => here(r.installation_id))
    .map((r) => ({
      id: r.id,
      label: [r.block, r.room_number].filter(Boolean).join(" ") || "—",
      beds: Number(r.bed_count ?? 0),
      closed: ["blocked", "maintenance"].includes(r.status),
    }));
  const usableBeds = rooms.filter((r) => !r.closed).reduce((n, r) => n + r.beds, 0);
  // An installation with no rooms here (a contractor's rig): POB only, no beds.
  const bedsManaged = rooms.length > 0;

  const nameOf = (r: Row) => one<{ full_name?: string }>(r.person)?.full_name || (r.person_name as string) || "—";
  const onboard = ((onboardRows ?? []) as Row[]).filter((r) => here(r.installation_id));
  const staffBy = new Map(((staffRows ?? []) as Row[]).map((s) => [s.profile_id as string, s]));
  const crewBy = new Map(due.crews.map((c) => [c.id, c]));
  const visitReturn = new Map(((visitRows ?? []) as Row[]).map((v) => [v.id as string, (v.return_date as string | null) ?? null]));
  const bookedRoom = new Map(((allocRows ?? []) as Row[]).filter((a) => a.visit_request_id).map((a) => [a.visit_request_id as string, a.room_id as string]));
  const aboardUntil = new Map(onboard.filter((o) => o.profile_id).map((o) => [o.profile_id as string, (o.demob_date as string | null) ?? null]));

  const crewName = (profileId: string | null) => {
    const s = profileId ? staffBy.get(profileId) : null;
    return s?.crew_id ? crewBy.get(s.crew_id)?.name ?? null : null;
  };
  const dueOn = (date: string) => due.days.filter((d) => d.date === date && (d.installationId ?? defaultInst) === instId);

  // Arrivals per day: the schedule's MOB lists, plus one-off trips, less
  // anyone already on board for that day.
  const reasons = new Map<string, string>();
  const arrivalsOn = (date: string): PlanArrival[] => {
    const list: PlanArrival[] = [];
    const seen = new Set<string>();
    for (const d of dueOn(date)) {
      for (const p of d.out) {
        const key = p.profile_id ? `p:${p.profile_id}` : p.visit_request_id ? `v:${p.visit_request_id}` : `n:${p.name}`;
        if (seen.has(key)) continue;
        if (p.profile_id && aboardUntil.has(p.profile_id)) {
          const until = aboardUntil.get(p.profile_id);
          if (!until || until >= date) continue;
        }
        seen.add(key);
        const staff = p.profile_id ? staffBy.get(p.profile_id) : null;
        const crew = staff?.crew_id ? crewBy.get(staff.crew_id) : null;
        const until = p.visit_request_id
          ? visitReturn.get(p.visit_request_id) ?? null
          : crew?.cycle_start_date
            ? nextCrewChangeDate(crew, date, "in")
            : null;
        reasons.set(`${date}|${key}`, p.reason);
        list.push({
          key,
          name: p.name,
          crew: crew?.name ?? (p.visit_request_id ? "Visitor" : null),
          cabinId: (staff?.fixed_room_id as string | null) ?? null,
          until,
          bookedRoomId: p.visit_request_id ? bookedRoom.get(p.visit_request_id) ?? null : null,
        });
      }
    }
    for (const t2 of (adhocRows ?? []) as Row[]) {
      if (t2.mobilize_date !== date || !here(t2.installation_id)) continue;
      const key = t2.profile_id ? `p:${t2.profile_id}` : `t:${t2.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      reasons.set(`${date}|${key}`, "Approved trip");
      list.push({
        key,
        name: nameOf(t2),
        crew: crewName(t2.profile_id ?? null),
        cabinId: t2.profile_id ? ((staffBy.get(t2.profile_id)?.fixed_room_id as string | null) ?? null) : null,
        until: (t2.demob_date as string | null) ?? null,
      });
    }
    return list;
  };

  const plan = planBeds({
    today: from,
    days: dates,
    rooms,
    onboard: onboard.map((o) => ({ name: nameOf(o), roomId: (o.room_id as string | null) ?? null, until: (o.demob_date as string | null) ?? null })),
    arrivalsOn,
  });
  const planBy = new Map(plan.map((p) => [p.date, p]));

  // Pending decisions falling in the window, on this installation.
  const pendingList: LookAheadPending[] = [
    ...((pendVisits ?? []) as Row[])
      .filter((v) => here(v.installation_id))
      .map((v) => ({ kind: "visit" as const, name: v.visitor_name as string, date: v.depart_date as string, what: "Visitor request" })),
    ...((pendTrips ?? []) as Row[])
      .filter((tr) => here(tr.installation_id))
      .map((tr) => ({ kind: "trip" as const, name: nameOf(tr), date: tr.mobilize_date as string, what: "Trip request" })),
    ...((pendMoves ?? []) as Row[])
      .filter((m) => here(m.installation_id))
      .map((m) => {
        const date = (m.requested_date as string) < (m.scheduled_date ?? m.requested_date) ? (m.requested_date as string) : ((m.scheduled_date ?? m.requested_date) as string);
        return { kind: "move" as const, name: nameOf(m), date, what: `${MOVE_KIND_LABEL[m.kind as MoveKind]} → ${m.requested_date}` };
      })
      .filter((p) => p.date >= from && p.date <= to),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const io = outlook.find((o) => o.installation.id === instId) ?? null;
  const days: LookAheadDay[] = dates.map((date) => {
    const o = io?.days.find((d) => d.date === date);
    const lists = dueOn(date);
    const crewsOf = (dir: "out" | "in") => {
      const names = new Set<string>();
      for (const d of lists) for (const p of d[dir]) {
        const c = crewName(p.profile_id);
        if (c && p.reason.startsWith(c)) names.add(c);
      }
      return [...names].sort();
    };
    const total = o?.total ?? 0;
    const p = planBy.get(date);
    const crewsOut = crewsOf("out");
    const crewsIn = crewsOf("in");
    const bedsFree = bedsManaged ? usableBeds - total : null;
    const day: LookAheadDay = {
      date,
      weekday: weekday(date),
      total,
      capacity: o?.capacity ?? installation?.capacity ?? 0,
      pending: o?.pending ?? 0,
      over: o?.over ?? false,
      overIfApproved: o?.overIfApproved ?? false,
      bedsFree,
      noBed: p?.short ?? 0,
      arrivals: p?.arrivals.length ?? 0,
      departures: lists.reduce((n, d) => n + d.in.length, 0),
      crewsOut,
      crewsIn,
      crewChange: crewsOut.length + crewsIn.length > 0,
      flagged: false,
    };
    day.flagged = day.overIfApproved || (day.bedsFree !== null && day.bedsFree < 0) || day.noBed > 0;
    return day;
  });

  // Day manifests in the window, for this installation.
  const manifests = ((manifestRows ?? []) as Row[])
    .filter((m) => here(m.installation_id))
    .map((m) => ({
      id: m.id as string,
      date: m.scheduled_date as string,
      direction: m.direction as "out" | "in",
      status: m.status as string,
      transport: (m.transport_mode as string | null) ?? null,
      pax: Number((m.offshore_manifest_pax as { count: number }[] | null)?.[0]?.count ?? 0),
    }));

  const pick =
    (input.selectedDate && dates.includes(input.selectedDate) ? input.selectedDate : null) ??
    days.find((d) => d.flagged && d.crewChange)?.date ??
    days.find((d) => d.crewChange || d.arrivals > 0)?.date ??
    null;
  let selected: LookAheadDetail | null = null;
  if (pick) {
    const p = planBy.get(pick);
    selected = {
      date: pick,
      arrivals: (p?.arrivals ?? []).map((a) => ({ ...a, reason: reasons.get(`${pick}|${a.key}`) ?? "" })),
      departures: dueOn(pick)
        .flatMap((d) => d.in)
        .map((x) => ({ name: x.name, reason: x.reason }))
        .sort((a, b) => a.reason.localeCompare(b.reason) || a.name.localeCompare(b.name)),
      manifests: manifests.filter((m) => m.date === pick).map(({ date: _d, ...m }) => (void _d, m)),
      pending: pendingList.filter((x) => x.date === pick),
    };
  }

  const peakDay = days.reduce<LookAheadDay | null>((b, d) => (!b || d.total > b.total ? d : b), null);
  const conflicts = plan.flatMap((d) => d.arrivals.filter((a) => a.blockedByOverstayer));
  const soon = dates.slice(0, 8);
  const drafts = manifests.filter((m) => m.status === "draft" && soon.includes(m.date));

  return {
    from,
    to,
    installation,
    installations: installations.map(({ id, name }) => ({ id, name })),
    usableBeds,
    days,
    selected,
    kpis: {
      overDays: days.filter((d) => d.overIfApproved).length,
      shortDays: days.filter((d) => (d.bedsFree !== null && d.bedsFree < 0) || d.noBed > 0).length,
      pending: pendingList.length,
      crewChanges: days.filter((d) => d.crewChange).length,
      peak: peakDay?.total ?? 0,
      peakDate: peakDay?.date ?? null,
    },
    todo: {
      noBed: { count: plan.reduce((n, d) => n + d.short, 0), dates: plan.filter((d) => d.short > 0).map((d) => d.date) },
      overstayerBlocks: { count: conflicts.length, cabins: [...new Set(conflicts.map((c) => c.cabin ?? "—"))] },
      pending: pendingList.length,
      pendingOverDates: days.filter((d) => d.overIfApproved && !d.over).map((d) => d.date),
      draftManifests: { count: drafts.length, dates: [...new Set(drafts.map((d) => d.date))].sort() },
      noRoom: bedsManaged ? onboard.filter((o) => !o.room_id).length : 0,
      openEnded: onboard.filter((o) => !o.demob_date).length,
      overstaying: onboard.filter((o) => o.demob_date && (o.demob_date as string) < from).length,
    },
    pendingList,
  };
}
