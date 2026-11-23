import { createClient } from "@/lib/supabase/server";
import type {
  Crew,
  CrewChangeSuggestion,
  RotationCalendar,
  RotationDay,
  RotationReport,
  TripMode,
} from "@/types/offshore";
import { DAY_MS, one, todayIso } from "./_shared";
import type { OffshoreScheduleSettings } from "./schedule-settings";
import { nextChangeDate } from "./rotation-math";
import { getRoster } from "./roster";

/**
 * The tenant's default crew-change mode ('auto' | 'manual'), stored on the
 * offshore module's tenant_services.settings. Drives which way the "Crew
 * changes due" prompts open. Defaults to 'auto' when unset. RLS-scoped.
 */
export async function getOffshoreDefaultMode(): Promise<TripMode> {
  return (await getOffshoreScheduleSettings()).mode;
}

/**
 * The two switches behind the nightly job: the crew-change mode, and whether
 * the schedule may open crew changes itself overnight ("act") or only prompt
 * and remind ("prompt", the default). Both live on the offshore module's
 * tenant_services.settings. RLS-scoped.
 */
export async function getOffshoreScheduleSettings(): Promise<OffshoreScheduleSettings> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "offshore")
    .maybeSingle();
  const s = (data?.settings ?? {}) as { default_crew_change_mode?: string; nightly_crew_changes?: string };
  return {
    mode: s.default_crew_change_mode === "manual" ? "manual" : "auto",
    nightly: s.nightly_crew_changes === "act" ? "act" : "prompt",
  };
}


/**
 * The installation a crew change goes to when the crew names none.
 *
 * Every crew change here goes to Juliet, and eleven of fourteen crews and
 * nearly four hundred trips said nothing at all, so the dashboard read "—"
 * where the platform's name belongs. Stored on the offshore module's tenant
 * settings, beside the default crew-change mode. RLS-scoped.
 */
export async function getOffshoreDefaultInstallation(): Promise<{ id: string; name: string } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "offshore")
    .maybeSingle();
  const id = (data?.settings as { default_installation_id?: string } | null)?.default_installation_id;
  if (!id) return null;
  const { data: inst } = await supabase
    .from("offshore_installations")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  return inst ? { id: String(inst.id), name: String(inst.name) } : null;
}

export async function getCrews(): Promise<Crew[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_crews")
    .select(
      "id, name, installation_id, rotation_pattern, offshore_days, onshore_days," +
        " transport_mode, departure_location, color, is_active, cycle_start_date," +
        " installation:offshore_installations(name), offshore_staff(count)",
    )
    .order("name");
  if (error) {
    console.error("getCrews:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, any>) => ({
    id: r.id,
    name: r.name,
    installation_id: r.installation_id,
    installation_name: one<{ name?: string }>(r.installation)?.name ?? null,
    rotation_pattern: r.rotation_pattern,
    offshore_days: r.offshore_days,
    onshore_days: r.onshore_days,
    transport_mode: r.transport_mode,
    departure_location: r.departure_location,
    color: r.color,
    is_active: r.is_active,
    member_count: r.offshore_staff?.[0]?.count ?? 0,
    cycle_start_date: r.cycle_start_date,
    next_change_date: nextChangeDate(
      {
        offshore_days: r.offshore_days,
        onshore_days: r.onshore_days,
        cycle_start_date: r.cycle_start_date,
      },
      todayIso(),
    ),
  }));
}

/**
 * Schedule vs reality: suggest a crew change where the rotation says a crew
 * should be offshore but nobody's boarded (mobilise), or should be onshore but
 * people are still on board (demobilise).
 */
export async function getCrewChangeSuggestions(): Promise<CrewChangeSuggestion[]> {
  const supabase = createClient();
  const crews = await getCrews();
  const [{ data: onboard }, { data: staffRows }, { data: moveRows }] = await Promise.all([
    supabase
      .from("offshore_trips")
      .select("profile_id, crew_id, mobilize_date, demob_date, person:profiles!offshore_trips_profile_id_fkey(full_name, email)")
      .eq("status", "onboard"),
    supabase
      .from("offshore_staff")
      .select("profile_id, crew_id, profile:profiles!offshore_staff_profile_id_fkey(full_name, email)"),
    supabase
      .from("offshore_movement_requests")
      .select("profile_id, kind, requested_date")
      .eq("status", "approved")
      .gte("requested_date", todayIso()),
  ]);
  const onboardByCrew = new Map<string, number>();
  for (const t of onboard ?? []) {
    const cid = t.crew_id as string | null;
    if (cid) onboardByCrew.set(cid, (onboardByCrew.get(cid) ?? 0) + 1);
  }
  // For the row's detail: who is behind each count, and why.
  const crewName = new Map(crews.map((c) => [c.id, c.name]));
  const nameOf = (p: unknown) => {
    const r = one<{ full_name?: string | null; email?: string | null }>(p as never);
    return r?.full_name || r?.email || "—";
  };
  const rosterCrew = new Map<string, string | null>();
  const membersOf = new Map<string, { id: string; name: string }[]>();
  for (const s of (staffRows ?? []) as Record<string, any>[]) {
    rosterCrew.set(String(s.profile_id), (s.crew_id as string | null) ?? null);
    if (!s.crew_id) continue;
    const list = membersOf.get(s.crew_id) ?? [];
    list.push({ id: String(s.profile_id), name: nameOf(s.profile) });
    membersOf.set(s.crew_id, list);
  }
  const tripsOf = new Map<string, Record<string, any>[]>(); // by profile
  for (const t of (onboard ?? []) as Record<string, any>[]) {
    if (!t.profile_id) continue;
    tripsOf.set(String(t.profile_id), [...(tripsOf.get(String(t.profile_id)) ?? []), t]);
  }
  const approved = new Map<string, string>();
  for (const m of (moveRows ?? []) as Record<string, any>[]) {
    const label = String(m.kind).replace("_", " ");
    approved.set(String(m.profile_id), `approved ${label} to ${m.requested_date}`);
  }
  const ashorePeople = (crewId: string) =>
    (membersOf.get(crewId) ?? [])
      .filter((m) => !(tripsOf.get(m.id) ?? []).some((t) => t.crew_id === crewId))
      .map((m) => {
        const other = (tripsOf.get(m.id) ?? [])[0];
        const detail = other
          ? `on board, booked under ${crewName.get(other.crew_id as string) ?? "no crew"}`
          : approved.get(m.id) ?? "ashore";
        return { name: m.name, detail };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  const aboardPeople = (crewId: string) =>
    ((onboard ?? []) as Record<string, any>[])
      .filter((t) => t.crew_id === crewId)
      .map((t) => {
        const pid = String(t.profile_id ?? "");
        const parts = [`on board since ${t.mobilize_date}`, t.demob_date ? `demob ${t.demob_date}` : "no demob date"];
        const now = rosterCrew.get(pid);
        if (pid && now !== undefined && now !== crewId) parts.push(now ? `now in ${crewName.get(now) ?? "another crew"} on the roster` : "no crew on the roster now");
        if (approved.has(pid)) parts.push(approved.get(pid)!);
        return { name: nameOf(t.person), detail: parts.join(" · ") };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

  const today = new Date(todayIso() + "T00:00:00Z").getTime();
  const out: CrewChangeSuggestion[] = [];
  for (const c of crews) {
    if (!c.is_active || !c.cycle_start_date || c.member_count === 0) continue;
    const period = c.offshore_days + c.onshore_days;
    if (period <= 0) continue;
    const start = new Date(c.cycle_start_date + "T00:00:00Z").getTime();
    const diff = Math.floor((today - start) / DAY_MS);
    const idx = ((diff % period) + period) % period;
    const expectedOffshore = idx < c.offshore_days;
    const aboard = onboardByCrew.get(c.id) ?? 0;
    // Mobilise while ANYONE is still ashore, not only when the whole crew is.
    // Requiring aboard === 0 silenced every partial crew change: on live data
    // CREW B2 starts its offshore phase today with 5 of 9 already aboard, so
    // the four still ashore raised no prompt at all. Same for CREW B (25/26)
    // and CREW F (34/35) mid-phase.
    const ashore = Math.max(0, c.member_count - aboard);
    if (expectedOffshore && ashore > 0) {
      const since = new Date(today - idx * DAY_MS).toISOString().slice(0, 10);
      out.push({ crew_id: c.id, crew_name: c.name, action: "mobilise", since, count: ashore, people: ashorePeople(c.id) });
    } else if (!expectedOffshore && aboard > 0) {
      const since = new Date(today - (idx - c.offshore_days) * DAY_MS).toISOString().slice(0, 10);
      out.push({ crew_id: c.id, crew_name: c.name, action: "demobilise", since, count: aboard, people: aboardPeople(c.id) });
    }
  }
  return out;
}

/** Branded rotation report from a chosen date, all crews + members + back-to-back. */
export async function getRotationReport(fromIso: string, weeks = 8): Promise<RotationReport> {
  const crews = (await getCrews()).filter((c) => c.is_active && c.cycle_start_date);
  const roster = await getRoster();
  const membersByCrew = new Map<string, string[]>();
  for (const r of roster) {
    if (!r.crew_id) continue;
    const list = membersByCrew.get(r.crew_id) ?? [];
    list.push(r.full_name || r.email);
    membersByCrew.set(r.crew_id, list);
  }

  const start = new Date(fromIso + "T00:00:00Z").getTime();
  const n = Math.max(1, weeks) * 7;
  const days: string[] = [];
  for (let i = 0; i < n; i++) days.push(new Date(start + i * DAY_MS).toISOString().slice(0, 10));

  const EPOCH = new Date("2026-01-01T00:00:00Z").getTime();
  const phaseOf = (c: (typeof crews)[number]) => {
    const cycle = c.offshore_days + c.onshore_days;
    if (cycle <= 0 || !c.cycle_start_date) return null;
    const d = Math.floor((new Date(c.cycle_start_date + "T00:00:00Z").getTime() - EPOCH) / DAY_MS);
    return ((d % cycle) + cycle) % cycle;
  };
  const b2bOf = (c: (typeof crews)[number]): string | null => {
    const cycle = c.offshore_days + c.onshore_days;
    const p = phaseOf(c);
    if (p === null) return null;
    const want = (p + c.offshore_days) % cycle;
    return (
      crews.find(
        (o) =>
          o.id !== c.id &&
          o.offshore_days === c.offshore_days &&
          o.onshore_days === c.onshore_days &&
          phaseOf(o) === want,
      )?.name ?? null
    );
  };

  return {
    from: fromIso,
    to: days[days.length - 1] ?? fromIso,
    days,
    crews: crews.map((c) => {
      const period = c.offshore_days + c.onshore_days;
      const anchor = c.cycle_start_date
        ? new Date(c.cycle_start_date + "T00:00:00Z").getTime()
        : null;
      const statuses = days.map((d): RotationDay | null => {
        if (!anchor || period <= 0) return null;
        const diff = Math.floor((new Date(d + "T00:00:00Z").getTime() - anchor) / DAY_MS);
        const idx = ((diff % period) + period) % period;
        if (idx === 0) return "change_out";
        if (idx === c.offshore_days) return "change_in";
        return idx < c.offshore_days ? "offshore" : "onshore";
      });
      return {
        id: c.id,
        name: c.name,
        offshore_days: c.offshore_days,
        onshore_days: c.onshore_days,
        member_count: c.member_count,
        statuses,
        members: (membersByCrew.get(c.id) ?? []).sort((a, b) => a.localeCompare(b)),
        back_to_back: b2bOf(c),
      };
    }),
  };
}

/** Gantt-style rotation calendar for the next `weeks` weeks, per crew. */
export async function getRotationCalendar(weeks = 8): Promise<RotationCalendar> {
  const crews = await getCrews();
  const roster = await getRoster();
  const membersByCrew = new Map<string, string[]>();
  for (const r of roster) {
    if (!r.crew_id) continue;
    const list = membersByCrew.get(r.crew_id) ?? [];
    list.push(r.full_name || r.email);
    membersByCrew.set(r.crew_id, list);
  }

  const start = new Date(todayIso() + "T00:00:00Z").getTime();
  const n = weeks * 7;
  const days: string[] = [];
  for (let i = 0; i < n; i++) days.push(new Date(start + i * DAY_MS).toISOString().slice(0, 10));

  return {
    days,
    crews: crews
      .filter((c) => c.is_active)
      .map((c) => {
        const period = c.offshore_days + c.onshore_days;
        const anchor = c.cycle_start_date
          ? new Date(c.cycle_start_date + "T00:00:00Z").getTime()
          : null;
        const statuses = days.map((d): RotationDay | null => {
          if (!anchor || period <= 0) return null;
          const diff = Math.floor((new Date(d + "T00:00:00Z").getTime() - anchor) / DAY_MS);
          const idx = ((diff % period) + period) % period;
          if (idx === 0) return "change_out"; // crew goes offshore
          if (idx === c.offshore_days) return "change_in"; // crew returns onshore
          return idx < c.offshore_days ? "offshore" : "onshore";
        });
        return {
          id: c.id,
          name: c.name,
          offshore_days: c.offshore_days,
          onshore_days: c.onshore_days,
          member_count: c.member_count,
          statuses,
          members: membersByCrew.get(c.id) ?? [],
        };
      }),
  };
}
