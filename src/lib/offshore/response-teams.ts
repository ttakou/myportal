import { createClient } from "@/lib/supabase/server";
import { EMERGENCY_TEAM_LABEL, type EmergencyTeamKind } from "@/types/offshore";

export type ResponseTeamOnBoard = {
  team: EmergencyTeamKind;
  label: string;
  /** Members of the active rotation window currently on board (sorted). */
  onboard: string[];
  /** Members of the window not currently on board. */
  ashore: number;
};

/**
 * Offshore emergency response teams (HLO / fire team) crossed with the live
 * POB: who of the active rotation window's teams is actually on board right
 * now. Consumed by the Emergency module's crisis command centre, so the
 * safety coordinator sees response capability at a glance. Returns [] when
 * the offshore module has no team assignments (e.g. tenant without offshore).
 */
export async function getResponseTeamsOnBoard(): Promise<ResponseTeamOnBoard[]> {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: teams }, { data: onboard }] = await Promise.all([
    supabase
      .from("offshore_emergency_teams")
      .select("from_date, to_date, team, profile_id, person:profiles!offshore_emergency_teams_profile_id_fkey(full_name)"),
    supabase.from("offshore_trips").select("profile_id").eq("status", "onboard"),
  ]);
  const rows = (teams ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  // Active rotation window: the one covering today, else the most recent.
  const windows = [...new Map(
    rows.map((r) => [`${r.from_date}|${r.to_date}`, { from: r.from_date as string, to: r.to_date as string }]),
  ).values()].sort((a, b) => b.from.localeCompare(a.from));
  const active = windows.find((w) => w.from <= today && w.to >= today) ?? windows[0];

  const onboardIds = new Set(
    ((onboard ?? []) as { profile_id: string | null }[])
      .map((t) => t.profile_id)
      .filter((x): x is string => Boolean(x)),
  );

  const result: ResponseTeamOnBoard[] = [];
  for (const team of ["hlo", "fire_team"] as EmergencyTeamKind[]) {
    const members = rows.filter(
      (r) => r.team === team && r.from_date === active.from && r.to_date === active.to,
    );
    if (members.length === 0) continue;
    const names: string[] = [];
    let ashore = 0;
    for (const m of members) {
      const person = Array.isArray(m.person) ? m.person[0] : m.person;
      const name = (person as { full_name?: string })?.full_name ?? "—";
      if (onboardIds.has(m.profile_id as string)) names.push(name);
      else ashore++;
    }
    names.sort((a, b) => a.localeCompare(b));
    result.push({ team, label: EMERGENCY_TEAM_LABEL[team], onboard: names, ashore });
  }
  return result;
}
