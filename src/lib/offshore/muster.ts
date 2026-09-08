import { createClient } from "@/lib/supabase/server";
import type { EmergencyRole, EmergencyTeamKind, EmergencyTeamMember, MusterCheckin, MusterDrill } from "@/types/offshore";
import { one } from "./_shared";

/** Distinct muster / lifeboat groups configured on rooms (e.g. LB-1, LB-2). */
export async function getMusterGroups(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_rooms")
    .select("lifeboat")
    .not("lifeboat", "is", null);
  const set = new Set<string>();
  for (const r of data ?? []) if (r.lifeboat) set.add(r.lifeboat as string);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export interface MusterDrillSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  kind: string;
  closed_out_at: string | null;
  voided: boolean;
  total: number;
  accounted: number;
  no_show: number;
  not_on_board: number;
}

/** Recent muster roll-calls (open, ended, closed out, voided) with their tallies, for the archive. */
export async function getMusterDrills(limit = 20): Promise<MusterDrillSummary[]> {
  const supabase = createClient();
  const { data: drills } = await supabase
    .from("offshore_muster_drills")
    .select("id, started_at, ended_at, kind, closed_out_at, voided")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (!drills?.length) return [];
  const ids = drills.map((d) => d.id as string);
  const { data: checks } = await supabase
    .from("offshore_muster_checkins")
    .select("drill_id, accounted, outcome")
    .in("drill_id", ids);
  const totals = new Map<string, { total: number; accounted: number; no_show: number; not_on_board: number }>();
  for (const c of checks ?? []) {
    const t = totals.get(c.drill_id as string) ?? { total: 0, accounted: 0, no_show: 0, not_on_board: 0 };
    t.total++;
    if (c.outcome === "no_show") t.no_show++;
    else if (c.outcome === "not_on_board") t.not_on_board++;
    else if (c.accounted || c.outcome === "accounted") t.accounted++;
    totals.set(c.drill_id as string, t);
  }
  return drills.map((d) => {
    const t = totals.get(d.id as string);
    return {
      id: d.id as string,
      started_at: d.started_at as string,
      ended_at: (d.ended_at as string | null) ?? null,
      kind: d.kind as string,
      closed_out_at: (d.closed_out_at as string | null) ?? null,
      voided: Boolean(d.voided),
      total: t?.total ?? 0,
      accounted: t?.accounted ?? 0,
      no_show: t?.no_show ?? 0,
      not_on_board: t?.not_on_board ?? 0,
    };
  });
}

const DRILL_SELECT =
  "id, started_at, ended_at, kind, closed_out_at, close_note, voided, closer:profiles!offshore_muster_drills_closed_out_by_fkey(full_name)";
const CHECKIN_SELECT = "id, profile_id, name, lifeboat, accounted, outcome, accounted_at";

function toDrill(drill: Record<string, any>, checkins: Record<string, any>[]): MusterDrill {
  return {
    id: drill.id as string,
    started_at: drill.started_at as string,
    ended_at: (drill.ended_at as string | null) ?? null,
    kind: drill.kind as string,
    closed_out_at: (drill.closed_out_at as string | null) ?? null,
    closed_out_by_name: one<{ full_name?: string }>(drill.closer)?.full_name ?? null,
    close_note: (drill.close_note as string | null) ?? null,
    voided: Boolean(drill.voided),
    checkins: checkins
      .map((c) => ({
        id: c.id as string,
        profile_id: (c.profile_id as string | null) ?? null,
        name: c.name as string,
        lifeboat: (c.lifeboat as string | null) ?? null,
        accounted: Boolean(c.accounted),
        outcome: (c.outcome as MusterCheckin["outcome"]) ?? (c.accounted ? "accounted" : null),
        accounted_at: (c.accounted_at as string | null) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** A specific muster roll-call with its check-ins (for the report/export). */
export async function getMusterDrill(id: string): Promise<MusterDrill | null> {
  const supabase = createClient();
  const { data: drill } = await supabase
    .from("offshore_muster_drills")
    .select(DRILL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (!drill) return null;
  const { data: checkins } = await supabase
    .from("offshore_muster_checkins")
    .select(CHECKIN_SELECT)
    .eq("drill_id", id);
  return toDrill(drill as Record<string, any>, (checkins ?? []) as Record<string, any>[]);
}

/** The currently-open muster roll-call (if any) with its check-ins. */
export async function getActiveMusterDrill(): Promise<MusterDrill | null> {
  const supabase = createClient();
  const { data: drill } = await supabase
    .from("offshore_muster_drills")
    .select(DRILL_SELECT)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!drill) return null;
  const { data: checkins } = await supabase
    .from("offshore_muster_checkins")
    .select(CHECKIN_SELECT)
    .eq("drill_id", (drill as Record<string, any>).id);
  return toDrill(drill as Record<string, any>, (checkins ?? []) as Record<string, any>[]);
}

/** Evacuation / head-count role holders per rotation window + muster group. */
export async function getEmergencyRoles(): Promise<EmergencyRole[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_emergency_roles")
    .select(
      "id, from_date, to_date, lifeboat, role, profile_id," +
        " person:profiles!offshore_emergency_roles_profile_id_fkey(full_name)",
    )
    .order("from_date", { ascending: false });
  if (error) {
    console.error("getEmergencyRoles:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, any>) => ({
    id: r.id,
    from_date: r.from_date,
    to_date: r.to_date,
    lifeboat: r.lifeboat,
    role: r.role,
    profile_id: r.profile_id ?? null,
    person_name: one<{ full_name?: string }>(r.person)?.full_name ?? null,
  }));
}

/** Members of the emergency response teams (HLO, fire team) per rotation window. */
export async function getEmergencyTeams(): Promise<EmergencyTeamMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_emergency_teams")
    .select(
      "id, from_date, to_date, team, profile_id," +
        " person:profiles!offshore_emergency_teams_profile_id_fkey(full_name)",
    )
    .order("from_date", { ascending: false });
  if (error) {
    console.error("getEmergencyTeams:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, any>) => ({
    id: r.id,
    from_date: r.from_date,
    to_date: r.to_date,
    team: r.team as EmergencyTeamKind,
    profile_id: r.profile_id,
    person_name: one<{ full_name?: string }>(r.person)?.full_name ?? null,
  }));
}
