import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { one } from "./_shared";
import {
  DAY_MANIFEST_HORIZON_DAYS,
  crewChangeDays,
  dayManifestTitle,
  daySeats,
  dueForDay,
  sharedTransport,
  type DayCrew,
  type DayOnboard,
  type DayStaff,
  type DayVisit,
  type DuePax,
} from "./day-manifests";
import type { Direction } from "./manifest-plan";

type Row = Record<string, any>;
const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const DIRECTIONS: Direction[] = ["out", "in"];
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
  const [crews, staff, onboard, visits, installations] = await Promise.all([
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
  ]);

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
  const days = crewChangeDays({ crews: inputs.crews, staff: inputs.staff, fromIso: from, days: horizon, defaultInstallationId });
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
    for (const direction of DIRECTIONS) {
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
          title: dayManifestTitle(day.date, direction, day.installationId ? inputs.installationName.get(day.installationId) ?? null : null),
          crew_id: null,
          installation_id: day.installationId,
          trip_type: direction === "out" ? "crew_change_out" : "crew_change_in",
          direction,
          transport_mode: sharedTransport(crewsThisWay.length ? crewsThisWay : [...day.out, ...day.in]),
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
