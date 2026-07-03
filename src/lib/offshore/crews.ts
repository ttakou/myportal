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
import { getRoster } from "./roster";

/**
 * The tenant's default crew-change mode ('auto' | 'manual'), stored on the
 * offshore module's tenant_services.settings. Drives which way the "Crew
 * changes due" prompts open. Defaults to 'auto' when unset. RLS-scoped.
 */
export async function getOffshoreDefaultMode(): Promise<TripMode> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "offshore")
    .maybeSingle();
  const mode = (data?.settings as { default_crew_change_mode?: string } | null)
    ?.default_crew_change_mode;
  return mode === "manual" ? "manual" : "auto";
}

/** Next date a crew starts an offshore period, on/after today, from its cycle. */
function nextChangeDate(
  cycleStart: string | null,
  offshoreDays: number,
  onshoreDays: number,
): string | null {
  if (!cycleStart) return null;
  const period = offshoreDays + onshoreDays;
  if (period <= 0) return null;
  const start = new Date(cycleStart + "T00:00:00Z").getTime();
  const now = new Date(todayIso() + "T00:00:00Z").getTime();
  let n = 0;
  if (now > start) n = Math.ceil((now - start) / (period * DAY_MS));
  return new Date(start + n * period * DAY_MS).toISOString().slice(0, 10);
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
    next_change_date: nextChangeDate(r.cycle_start_date, r.offshore_days, r.onshore_days),
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
  const { data: onboard } = await supabase
    .from("offshore_trips")
    .select("crew_id")
    .eq("status", "onboard");
  const onboardByCrew = new Map<string, number>();
  for (const t of onboard ?? []) {
    const cid = t.crew_id as string | null;
    if (cid) onboardByCrew.set(cid, (onboardByCrew.get(cid) ?? 0) + 1);
  }

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
    if (expectedOffshore && aboard === 0) {
      const since = new Date(today - idx * DAY_MS).toISOString().slice(0, 10);
      out.push({ crew_id: c.id, crew_name: c.name, action: "mobilise", since, count: c.member_count });
    } else if (!expectedOffshore && aboard > 0) {
      const since = new Date(today - (idx - c.offshore_days) * DAY_MS).toISOString().slice(0, 10);
      out.push({ crew_id: c.id, crew_name: c.name, action: "demobilise", since, count: aboard });
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
