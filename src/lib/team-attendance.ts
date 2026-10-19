import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getModuleSettings } from "@/lib/module-settings";
import {
  memberDay,
  datesBetween,
  summarise,
  workHours,
  type AttendanceLite,
  type LineMember,
  type MemberDay,
  type MemberSummary,
  type WorkHours,
} from "./team-attendance-format";

type LineRow = {
  profile_id: string;
  full_name: string | null;
  department: string | null;
  job_title: string | null;
  manager_name: string | null;
  depth: number;
  is_rotational: boolean | null;
  crew_name: string | null;
  offshore_days: number | null;
  onshore_days: number | null;
  cycle_start_date: string | null;
};

/**
 * Everybody below `managerId` (the caller when null) in the reporting line.
 * The database decides who may ask for whose line: anyone for their own,
 * tenant administrators for anybody's.
 */
export async function getLine(managerId: string | null): Promise<LineMember[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("team_line", managerId ? { p_manager: managerId } : {});
  return ((data ?? []) as LineRow[]).map((r) => ({
    profileId: r.profile_id,
    name: r.full_name || "—",
    department: r.department,
    jobTitle: r.job_title,
    managerName: r.manager_name,
    depth: r.depth,
    crew: r.crew_name,
    rotation:
      r.is_rotational && r.offshore_days != null && r.onshore_days != null
        ? { offshore_days: r.offshore_days, onshore_days: r.onshore_days, cycle_start_date: r.cycle_start_date }
        : null,
  }));
}

/** Whether the caller has anybody reporting to them, for showing the report at all. */
export async function hasDirectReports(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", userId)
    .eq("is_active", true);
  return (count ?? 0) > 0;
}

/** Managers with an active line, for an administrator's picker. */
export async function getManagers(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("manager:profiles!profiles_manager_id_fkey(id, full_name)")
    .eq("is_active", true)
    .not("manager_id", "is", null);
  const byId = new Map<string, string>();
  for (const r of (data ?? []) as { manager: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null }[]) {
    const m = Array.isArray(r.manager) ? r.manager[0] : r.manager;
    if (m) byId.set(m.id, m.full_name || "—");
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Attendance rows for the period. Row-level security already narrows them to
 * what the caller may see — their own line, or everybody for security and
 * administrators — so the line filter here is about relevance, not access.
 * Paged, because a quarter for a large line runs past one response.
 */
async function getAttendance(from: string, to: string, ids: Set<string>): Promise<AttendanceLite[]> {
  const supabase = createClient();
  const out: AttendanceLite[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from("staff_attendance")
      .select("profile_id, attendance_date, check_in_at, check_out_at")
      .gte("attendance_date", from)
      .lte("attendance_date", to)
      .order("attendance_date")
      .order("profile_id")
      .range(offset, offset + PAGE - 1);
    const rows = (data ?? []) as AttendanceLite[];
    for (const r of rows) if (ids.has(r.profile_id)) out.push(r);
    if (rows.length < PAGE) break;
  }
  return out;
}

export interface TeamAttendanceRow {
  member: LineMember;
  days: MemberDay[];
  summary: MemberSummary;
}

export async function getTeamAttendance(input: {
  members: LineMember[];
  from: string;
  to: string;
  today: string;
}): Promise<{ rows: TeamAttendanceRow[]; hours: WorkHours }> {
  const ids = new Set(input.members.map((m) => m.profileId));
  const [attendance, settings] = await Promise.all([
    ids.size ? getAttendance(input.from, input.to, ids) : Promise.resolve([]),
    getModuleSettings("visitors"),
  ]);
  const hours = workHours(settings.work_start, settings.work_end);
  const byKey = new Map(attendance.map((a) => [`${a.profile_id}|${a.attendance_date}`, a]));
  const dates = datesBetween(input.from, input.to);
  const rows = input.members.map((member) => {
    const days = dates.map((d) => memberDay(member, byKey.get(`${member.profileId}|${d}`), d, input.today, hours));
    return { member, days, summary: summarise(days) };
  });
  return { rows, hours };
}

/** Today's headcount for the caller's line, for the dashboard; null with nobody below them. */
export async function getTeamToday(today: string): Promise<{ people: number; in: number; notIn: number; rotation: number } | null> {
  const members = await getLine(null);
  if (members.length === 0) return null;
  const { rows } = await getTeamAttendance({ members, from: today, to: today, today });
  const s = rows.map((r) => r.days[0].status);
  return {
    people: members.length,
    in: s.filter((x) => x === "on_site" || x === "present").length,
    notIn: s.filter((x) => x === "absent").length,
    rotation: s.filter((x) => x === "offshore" || x === "field_break").length,
  };
}
