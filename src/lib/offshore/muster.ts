import { createClient } from "@/lib/supabase/server";
import type { EmergencyRole, MusterDrill } from "@/types/offshore";
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

/** Recent muster roll-calls (active + ended) with accounted/total, for the archive. */
export async function getMusterDrills(limit = 20): Promise<
  { id: string; started_at: string; ended_at: string | null; kind: string; total: number; accounted: number }[]
> {
  const supabase = createClient();
  const { data: drills } = await supabase
    .from("offshore_muster_drills")
    .select("id, started_at, ended_at, kind")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (!drills?.length) return [];
  const ids = drills.map((d) => d.id as string);
  const { data: checks } = await supabase
    .from("offshore_muster_checkins")
    .select("drill_id, accounted")
    .in("drill_id", ids);
  const totals = new Map<string, { total: number; accounted: number }>();
  for (const c of checks ?? []) {
    const t = totals.get(c.drill_id as string) ?? { total: 0, accounted: 0 };
    t.total++;
    if (c.accounted) t.accounted++;
    totals.set(c.drill_id as string, t);
  }
  return drills.map((d) => ({
    id: d.id as string,
    started_at: d.started_at as string,
    ended_at: (d.ended_at as string | null) ?? null,
    kind: d.kind as string,
    total: totals.get(d.id as string)?.total ?? 0,
    accounted: totals.get(d.id as string)?.accounted ?? 0,
  }));
}

/** A specific muster roll-call with its check-ins (for the report/export). */
export async function getMusterDrill(id: string): Promise<MusterDrill | null> {
  const supabase = createClient();
  const { data: drill } = await supabase
    .from("offshore_muster_drills")
    .select("id, started_at, ended_at, kind")
    .eq("id", id)
    .maybeSingle();
  if (!drill) return null;
  const { data: checkins } = await supabase
    .from("offshore_muster_checkins")
    .select("id, profile_id, name, lifeboat, accounted")
    .eq("drill_id", id);
  return {
    id: drill.id as string,
    started_at: drill.started_at as string,
    ended_at: (drill.ended_at as string | null) ?? null,
    kind: drill.kind as string,
    checkins: ((checkins ?? []) as Record<string, any>[])
      .map((c) => ({
        id: c.id as string,
        profile_id: (c.profile_id as string | null) ?? null,
        name: c.name as string,
        lifeboat: (c.lifeboat as string | null) ?? null,
        accounted: Boolean(c.accounted),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** The currently-open muster roll-call (if any) with its check-ins. */
export async function getActiveMusterDrill(): Promise<MusterDrill | null> {
  const supabase = createClient();
  const { data: drill } = await supabase
    .from("offshore_muster_drills")
    .select("id, started_at, ended_at, kind")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!drill) return null;
  const { data: checkins } = await supabase
    .from("offshore_muster_checkins")
    .select("id, profile_id, name, lifeboat, accounted")
    .eq("drill_id", drill.id);
  return {
    id: drill.id as string,
    started_at: drill.started_at as string,
    ended_at: (drill.ended_at as string | null) ?? null,
    kind: drill.kind as string,
    checkins: ((checkins ?? []) as Record<string, any>[])
      .map((c) => ({
        id: c.id as string,
        profile_id: (c.profile_id as string | null) ?? null,
        name: c.name as string,
        lifeboat: (c.lifeboat as string | null) ?? null,
        accounted: Boolean(c.accounted),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
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
