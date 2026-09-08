import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one, todayIso } from "./_shared";
import { bedFor, type BedShown } from "./bed-for";
import { crewStatus, currentCrewChange, tripOnBoard, type CrewChange, type CrewStatus } from "./crew-change";
import { getOffshoreDefaultInstallation } from "./crews";
import type { BoardRow } from "./where-board";

/**
 * Where one member of the offshore workforce is, and which bed is theirs.
 *
 * The question "where is X" had no screen. The answer was spread over the
 * roster (crew, default cabin), the trips (on board or not, which bed this
 * time), the crew's cycle (where the schedule puts them) and the attendance
 * log (whether they pressed "I'm in" at the base) — four places, none of
 * which said what the others knew. This reads all four for one person and
 * puts the schedule's answer first, the way the dashboard card does.
 */
export interface Whereabouts {
  profileId: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  /** On the offshore roster at all. */
  onRoster: boolean;
  isRotational: boolean;
  crew: string | null;
  installation: string | null;
  lifeboat: string | null;
  backToBack: string | null;
  /** The schedule's reading of today; null when there is no crew or no cycle. */
  schedule: (CrewChange & { status: CrewStatus }) | null;
  /** True when a recorded trip has them on board today. */
  onBoard: boolean;
  bed: BedShown;
  lastTrip: {
    mobilize: string;
    demob: string | null;
    status: string;
    installation: string | null;
  } | null;
  /** The most recent "I'm in" at the base, if ever. */
  lastCheckIn: { date: string; at: string; out: string | null } | null;
}

export async function getWhereabouts(profileId: string): Promise<Whereabouts | null> {
  const supabase = createClient();
  const today = todayIso();

  const [{ data: profile }, { data: staff }, { data: trips }, { data: attendance }, fallbackInstallation] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, job_title, department")
        .eq("id", profileId)
        .maybeSingle(),
      supabase
        .from("offshore_staff")
        // One string literal, not a concatenation: Supabase infers the row
        // type from the literal, and a concatenated select degrades it to an
        // error type.
        .select(
          "fixed_bed, lifeboat, is_rotational, crew:offshore_crews(name, offshore_days, onshore_days, cycle_start_date, installation:offshore_installations(name)), room:offshore_rooms(room_number, block, lifeboat), b2b:profiles!offshore_staff_back_to_back_id_fkey(full_name)",
        )
        .eq("profile_id", profileId)
        .maybeSingle(),
      supabase
        .from("offshore_trips")
        .select(
          "mobilize_date, demob_date, status, bed_no, lifeboat, installation:offshore_installations(name), room:offshore_rooms(room_number, block)",
        )
        .eq("profile_id", profileId)
        .neq("status", "cancelled")
        .order("mobilize_date", { ascending: false })
        .limit(1),
      supabase
        .from("staff_attendance")
        .select("attendance_date, check_in_at, check_out_at")
        .eq("profile_id", profileId)
        .order("attendance_date", { ascending: false })
        .limit(1),
      getOffshoreDefaultInstallation(),
    ]);
  if (!profile) return null;

  const s = (staff ?? null) as unknown as Record<string, unknown> | null;
  const crew = one<{
    name?: string;
    offshore_days?: number;
    onshore_days?: number;
    cycle_start_date?: string | null;
    installation?: { name?: string } | { name?: string }[] | null;
  }>((s?.crew as never) ?? null);
  const fixedRoom = one<{ room_number?: string; block?: string; lifeboat?: string }>(
    (s?.room as never) ?? null,
  );
  const latest = ((trips ?? []) as unknown as Record<string, unknown>[])[0] ?? null;
  const tripRoom = latest
    ? one<{ room_number?: string; block?: string }>((latest.room as never) ?? null)
    : null;

  const lastTrip = latest
    ? {
        mobilize: String(latest.mobilize_date),
        demob: (latest.demob_date as string | null) ?? null,
        status: String(latest.status),
        installation:
          one<{ name?: string }>((latest.installation as never) ?? null)?.name ?? null,
      }
    : null;

  const onBoard = tripOnBoard(lastTrip, today);

  // Where they are, from the schedule; the record read against it.
  let schedule: Whereabouts["schedule"] = null;
  if (crew && crew.offshore_days != null && crew.onshore_days != null) {
    const change = currentCrewChange(
      {
        offshore_days: Number(crew.offshore_days),
        onshore_days: Number(crew.onshore_days),
        cycle_start_date: crew.cycle_start_date ?? null,
      },
      today,
    );
    if (change) schedule = { ...change, status: crewStatus(change, lastTrip, today) };
  }

  const roomLabel = (r: { room_number?: string; block?: string } | null) =>
    r ? [r.block, r.room_number].filter(Boolean).join(" ") || null : null;

  const bed = bedFor({
    onBoard,
    tripRoom: roomLabel(tripRoom),
    tripBed: (latest?.bed_no as string | null) ?? null,
    fixedRoom: roomLabel(fixedRoom),
    fixedBed: (s?.fixed_bed as string | null) ?? null,
  });

  const att = ((attendance ?? []) as unknown as Record<string, unknown>[])[0] ?? null;

  return {
    profileId: String(profile.id),
    name: (profile.full_name as string | null) || (profile.email as string | null) || "—",
    jobTitle: (profile.job_title as string | null) ?? null,
    department: (profile.department as string | null) ?? null,
    onRoster: !!s,
    isRotational: s ? (s.is_rotational as boolean | null) ?? true : false,
    crew: crew?.name ?? null,
    installation:
      lastTrip?.installation ??
      one<{ name?: string }>((crew?.installation as never) ?? null)?.name ??
      fallbackInstallation?.name ??
      null,
    // Muster follows the room in use, then the fixed room, then the roster.
    lifeboat:
      (onBoard ? ((latest?.lifeboat as string | null) ?? null) : null) ??
      (fixedRoom?.lifeboat as string | null) ??
      (s?.lifeboat as string | null) ??
      null,
    backToBack: one<{ full_name?: string }>((s?.b2b as never) ?? null)?.full_name ?? null,
    schedule,
    onBoard,
    bed,
    lastTrip,
    lastCheckIn: att
      ? {
          date: String(att.attendance_date),
          at: String(att.check_in_at),
          out: (att.check_out_at as string | null) ?? null,
        }
      : null,
  };
}

/** Everyone on the offshore roster, for the picker. Sorted by name. */
export async function getWhereaboutsPeople(): Promise<{ id: string; name: string; crew: string | null }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_staff")
    .select("profile_id, profile:profiles!offshore_staff_profile_id_fkey(full_name, email), crew:offshore_crews(name)");
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const p = one<{ full_name?: string; email?: string }>((r.profile as never) ?? null);
      return {
        id: String(r.profile_id),
        name: p?.full_name || p?.email || "—",
        crew: one<{ name?: string }>((r.crew as never) ?? null)?.name ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * Everyone on the roster at once, for the board: the same reading as
 * `getWhereabouts` for one person, from four queries instead of four per
 * person. The latest non-cancelled trip per person comes from one ordered
 * scan of the trips, taking the first row seen for each profile.
 */
export async function getWhereaboutsBoard(): Promise<BoardRow[]> {
  const supabase = createClient();
  const today = todayIso();
  const [{ data: staffRows }, { data: tripRows }, fallbackInstallation] = await Promise.all([
    supabase
      .from("offshore_staff")
      .select(
        "profile_id, fixed_bed, lifeboat, is_rotational, profile:profiles!offshore_staff_profile_id_fkey(full_name, email), crew:offshore_crews(name, offshore_days, onshore_days, cycle_start_date, installation:offshore_installations(name)), room:offshore_rooms(room_number, block, lifeboat)",
      ),
    supabase
      .from("offshore_trips")
      .select(
        "profile_id, mobilize_date, demob_date, status, bed_no, lifeboat, installation:offshore_installations(name), room:offshore_rooms(room_number, block)",
      )
      .neq("status", "cancelled")
      .not("profile_id", "is", null)
      .order("mobilize_date", { ascending: false }),
    getOffshoreDefaultInstallation(),
  ]);

  const latestByProfile = new Map<string, Record<string, unknown>>();
  for (const t of (tripRows ?? []) as unknown as Record<string, unknown>[]) {
    const pid = String(t.profile_id);
    if (!latestByProfile.has(pid)) latestByProfile.set(pid, t);
  }
  const roomLabel = (r: { room_number?: string; block?: string } | null) =>
    r ? [r.block, r.room_number].filter(Boolean).join(" ") || null : null;

  const rows: BoardRow[] = [];
  for (const s of (staffRows ?? []) as unknown as Record<string, unknown>[]) {
    const pid = String(s.profile_id);
    const profile = one<{ full_name?: string; email?: string }>((s.profile as never) ?? null);
    const crew = one<{
      name?: string;
      offshore_days?: number;
      onshore_days?: number;
      cycle_start_date?: string | null;
      installation?: { name?: string } | { name?: string }[] | null;
    }>((s.crew as never) ?? null);
    const fixedRoom = one<{ room_number?: string; block?: string; lifeboat?: string }>((s.room as never) ?? null);
    const latest = latestByProfile.get(pid) ?? null;
    const tripRoom = latest ? one<{ room_number?: string; block?: string }>((latest.room as never) ?? null) : null;
    const lastTrip = latest
      ? {
          mobilize: String(latest.mobilize_date),
          demob: (latest.demob_date as string | null) ?? null,
          status: String(latest.status),
          installation: one<{ name?: string }>((latest.installation as never) ?? null)?.name ?? null,
        }
      : null;
    const onBoard = tripOnBoard(lastTrip, today);

    let kind: BoardRow["kind"] = "no_schedule";
    let nextChange: string | null = null;
    let daysToChange: number | null = null;
    if (crew && crew.offshore_days != null && crew.onshore_days != null) {
      const change = currentCrewChange(
        {
          offshore_days: Number(crew.offshore_days),
          onshore_days: Number(crew.onshore_days),
          cycle_start_date: crew.cycle_start_date ?? null,
        },
        today,
      );
      if (change) {
        kind = crewStatus(change, lastTrip, today).kind;
        nextChange = change.nextChange;
        daysToChange = change.daysToChange;
      }
    }

    const bed = bedFor({
      onBoard,
      tripRoom: roomLabel(tripRoom),
      tripBed: (latest?.bed_no as string | null) ?? null,
      fixedRoom: roomLabel(fixedRoom),
      fixedBed: (s.fixed_bed as string | null) ?? null,
    });

    rows.push({
      id: pid,
      name: profile?.full_name || profile?.email || "—",
      crew: crew?.name ?? null,
      lifeboat:
        (onBoard ? ((latest?.lifeboat as string | null) ?? null) : null) ??
        (fixedRoom?.lifeboat as string | null) ??
        (s.lifeboat as string | null) ??
        null,
      bed: bed.label,
      bedSource: bed.source,
      installation:
        lastTrip?.installation ??
        one<{ name?: string }>((crew?.installation as never) ?? null)?.name ??
        fallbackInstallation?.name ??
        null,
      onBoard,
      kind,
      nextChange,
      daysToChange,
      isRotational: (s.is_rotational as boolean | null) ?? true,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
