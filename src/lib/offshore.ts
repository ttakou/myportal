import { createClient } from "@/lib/supabase/server";
import type {
  AccommodationSummary,
  AssignableEmployee,
  BedAllocation,
  CertAlert,
  Crew,
  Flight,
  Installation,
  Manifest,
  ManifestPax,
  MealEntry,
  OffshoreTrip,
  Pob,
  PobAsOf,
  PobBreakdown,
  PobPerson,
  Room,
  RoomAvailability,
  RoomHistoryRow,
  RosterEntry,
  RotationCalendar,
  RotationDay,
  VisitRequest,
} from "@/types/offshore";

function one2<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const SELECT =
  "id, installation_id, mobilize_date, demob_date, status, hse_cleared_at, flight_id, bed_no," +
  " person:profiles!offshore_trips_profile_id_fkey(full_name)," +
  " installation:offshore_installations(name)," +
  " flight:helicopter_flights(flight_date, route)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function mapTrip(row: Record<string, any>): OffshoreTrip {
  const flight = one<{ flight_date?: string; route?: string }>(row.flight);
  return {
    id: row.id,
    person_name: one<{ full_name?: string }>(row.person)?.full_name ?? null,
    installation_id: row.installation_id,
    installation_name: one<{ name?: string }>(row.installation)?.name ?? null,
    mobilize_date: row.mobilize_date,
    demob_date: row.demob_date,
    status: row.status,
    hse_cleared_at: row.hse_cleared_at,
    flight_id: row.flight_id,
    flight_label: flight ? `${flight.route} · ${flight.flight_date}` : null,
    bed_no: row.bed_no,
  };
}

export async function getMyOffshoreTrips(): Promise<OffshoreTrip[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("offshore_trips")
    .select(SELECT)
    .eq("profile_id", user.id)
    .order("mobilize_date", { ascending: false });
  return (data ?? []).map((r) => mapTrip(r as Record<string, any>));
}

export async function getAllOffshoreTrips(): Promise<OffshoreTrip[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_trips")
    .select(SELECT)
    .order("mobilize_date", { ascending: false });
  return (data ?? []).map((r) => mapTrip(r as Record<string, any>));
}

export async function getInstallations(): Promise<Installation[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_installations")
    .select("id, name, pob_capacity")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as Installation[];
}

/** Every installation (incl. retired) for the configuration panel. */
export async function getAllInstallations(): Promise<Installation[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_installations")
    .select("id, name, pob_capacity, is_active")
    .order("name");
  return (data ?? []) as Installation[];
}

export async function getFlights(): Promise<Flight[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("helicopter_flights")
    .select("id, flight_date, route, seats")
    .order("flight_date", { ascending: false });
  return (data ?? []) as Flight[];
}

export async function getPob(): Promise<Pob[]> {
  const supabase = createClient();
  const { data } = await supabase.from("offshore_pob").select("*").order("name");
  return (data ?? []) as Pob[];
}

// --- Crew change, roster & accommodation (Phase 1) ---------------------------

const DAY_MS = 86_400_000;
const todayIso = () => new Date().toISOString().slice(0, 10);

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
    installation_name: one2<{ name?: string }>(r.installation)?.name ?? null,
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

export async function getRooms(): Promise<Room[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_rooms")
    .select(
      "id, installation_id, block, floor, room_number, room_type, bed_count, max_bed_count," +
        " gender_restriction, status, special_flag, notes," +
        " installation:offshore_installations(name), offshore_staff(count)",
    )
    .eq("is_active", true)
    .order("room_number");
  if (error) {
    console.error("getRooms:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, any>) => ({
    id: r.id,
    installation_id: r.installation_id,
    installation_name: one2<{ name?: string }>(r.installation)?.name ?? null,
    block: r.block,
    floor: r.floor,
    room_number: r.room_number,
    room_type: r.room_type,
    bed_count: r.bed_count,
    max_bed_count: r.max_bed_count,
    gender_restriction: r.gender_restriction,
    status: r.status,
    special_flag: r.special_flag,
    notes: r.notes,
    fixed_assigned: r.offshore_staff?.[0]?.count ?? 0,
  }));
}

export async function getRoster(): Promise<RosterEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_staff")
    .select(
      "id, profile_id, crew_id, position, company, back_to_back_id, fixed_room_id, fixed_bed," +
        " medical_expiry, bosiet_expiry, huet_expiry, emergency_contact, travel_eligible," +
        " profile:profiles!offshore_staff_profile_id_fkey(full_name, email)," +
        " b2b:profiles!offshore_staff_back_to_back_id_fkey(full_name)," +
        " crew:offshore_crews(name), room:offshore_rooms(room_number, block)",
    );
  if (error) {
    console.error("getRoster:", error.message);
    return [];
  }
  return (data ?? [])
    .map((r: Record<string, any>) => {
      const p = one2<{ full_name?: string; email?: string }>(r.profile);
      const room = one2<{ room_number?: string; block?: string }>(r.room);
      return {
        id: r.id,
        profile_id: r.profile_id,
        full_name: p?.full_name ?? null,
        email: p?.email ?? "",
        crew_id: r.crew_id,
        crew_name: one2<{ name?: string }>(r.crew)?.name ?? null,
        position: r.position,
        company: r.company,
        back_to_back_id: r.back_to_back_id,
        back_to_back_name: one2<{ full_name?: string }>(r.b2b)?.full_name ?? null,
        fixed_room_id: r.fixed_room_id,
        fixed_room_label: room
          ? [room.block, room.room_number].filter(Boolean).join(" ")
          : null,
        fixed_bed: r.fixed_bed,
        medical_expiry: r.medical_expiry,
        bosiet_expiry: r.bosiet_expiry,
        huet_expiry: r.huet_expiry,
        emergency_contact: r.emergency_contact,
        travel_eligible: r.travel_eligible,
      } as RosterEntry;
    })
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
}

/** All active tenant employees with their current crew, for the crew builder. */
export async function getAssignableEmployees(): Promise<AssignableEmployee[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email," +
        " offshore_staff!offshore_staff_profile_id_fkey(crew_id, crew:offshore_crews(name))",
    )
    .eq("is_active", true)
    .order("full_name");
  if (error) {
    console.error("getAssignableEmployees:", error.message);
    return [];
  }
  return (data ?? []).map((p: Record<string, any>) => {
    const s = one2<{ crew_id?: string; crew?: unknown }>(p.offshore_staff);
    return {
      id: p.id,
      name: (p.full_name as string) || (p.email as string) || "Unknown",
      crew_id: s?.crew_id ?? null,
      crew_name: s ? one2<{ name?: string }>(s.crew as any)?.name ?? null : null,
    };
  });
}

/** Tenant profiles not yet on the offshore roster, for adding members. */
export async function getAddableProfiles(): Promise<{ id: string; full_name: string }[]> {
  const supabase = createClient();
  const [{ data: profiles }, { data: staff }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("offshore_staff").select("profile_id"),
  ]);
  const taken = new Set((staff ?? []).map((s) => s.profile_id as string));
  return (profiles ?? [])
    .filter((p) => !taken.has(p.id as string))
    .map((p) => ({ id: p.id as string, full_name: (p.full_name as string) ?? "" }));
}

/** POB dashboard: counts by installation, crew, category + today's movements. */
export async function getPobBreakdown(): Promise<PobBreakdown> {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: onboard }, { data: pob }, { data: arrivals }, { data: visitors }] =
    await Promise.all([
      supabase
        .from("offshore_trips")
        .select(
          "category, demob_date, installation:offshore_installations(name), crew:offshore_crews(name)," +
            " person:profiles!offshore_trips_profile_id_fkey(full_name)",
        )
        .eq("status", "onboard"),
      supabase.from("offshore_pob").select("name, pob, pob_capacity").order("name"),
      supabase
        .from("offshore_trips")
        .select("id")
        .eq("mobilize_date", today)
        .in("status", ["manifested", "hse_cleared"]),
      supabase
        .from("offshore_visit_requests")
        .select("visitor_name, return_date, depart_date, installation:offshore_installations(name)")
        .eq("status", "onboard"),
    ]);

  const rows = onboard ?? [];
  const byCrewMap = new Map<string, number>();
  const byInstMap = new Map<string, number>(); // visitor counts per installation
  let staff = 0;
  let visitor = 0;
  let departuresToday = 0;
  let arrivalsToday = arrivals?.length ?? 0;
  const overstayers: PobBreakdown["overstayers"] = [];

  for (const r of rows as Record<string, any>[]) {
    if (r.category === "visitor") visitor++;
    else staff++;
    const crew = one2<{ name?: string }>(r.crew)?.name ?? "Unassigned";
    byCrewMap.set(crew, (byCrewMap.get(crew) ?? 0) + 1);
    if (r.demob_date) {
      if (r.demob_date === today) departuresToday++;
      if (r.demob_date < today) {
        overstayers.push({
          name: one2<{ full_name?: string }>(r.person)?.full_name ?? "—",
          installation: one2<{ name?: string }>(r.installation)?.name ?? null,
          demob_date: r.demob_date,
        });
      }
    }
  }

  // Onboard visitors count toward POB too (they aren't offshore_trips rows).
  for (const v of (visitors ?? []) as Record<string, any>[]) {
    visitor++;
    const instName = one2<{ name?: string }>(v.installation)?.name ?? null;
    if (instName) byInstMap.set(instName, (byInstMap.get(instName) ?? 0) + 1);
    if (v.return_date) {
      if (v.return_date === today) departuresToday++;
      if (v.return_date < today) {
        overstayers.push({ name: v.visitor_name, installation: instName, demob_date: v.return_date });
      }
    }
  }

  return {
    total: rows.length + (visitors?.length ?? 0),
    byInstallation: (pob ?? []).map((p) => ({
      name: p.name as string,
      pob: ((p.pob as number) ?? 0) + (byInstMap.get(p.name as string) ?? 0),
      capacity: (p.pob_capacity as number) ?? 0,
    })),
    byCrew: [...byCrewMap.entries()].map(([name, n]) => ({ name, pob: n })),
    byCategory: { staff, visitor },
    arrivalsToday,
    departuresToday,
    overstayers,
  };
}

/** Accommodation rollup across rooms + current on-board occupancy. */
export async function getAccommodationSummary(): Promise<AccommodationSummary> {
  const supabase = createClient();
  const [{ data: rooms }, { count: occupied }] = await Promise.all([
    supabase
      .from("offshore_rooms")
      .select("bed_count, status, offshore_staff(count)")
      .eq("is_active", true),
    supabase
      .from("offshore_trips")
      .select("id", { count: "exact", head: true })
      .eq("status", "onboard"),
  ]);

  let totalBeds = 0;
  let fixedBeds = 0;
  let blockedRooms = 0;
  for (const r of (rooms ?? []) as Record<string, any>[]) {
    const blocked = ["blocked", "maintenance"].includes(r.status);
    if (blocked) blockedRooms++;
    else totalBeds += r.bed_count ?? 0;
    fixedBeds += r.offshore_staff?.[0]?.count ?? 0;
  }
  const occupiedBeds = occupied ?? 0;
  return {
    totalRooms: rooms?.length ?? 0,
    totalBeds,
    fixedBeds,
    occupiedBeds,
    blockedRooms,
    availableBeds: Math.max(0, totalBeds - occupiedBeds),
  };
}

// --- Visitor requests & accommodation allocation (Phase 2) -------------------

function mapVisit(row: Record<string, any>): VisitRequest {
  const alloc = (row.offshore_bed_allocations as any[])?.find((a) => a.status !== "checked_out");
  const room = alloc && (Array.isArray(alloc.room) ? alloc.room[0] : alloc.room);
  return {
    id: row.id,
    requester_name: one2<{ full_name?: string }>(row.requester)?.full_name ?? null,
    visitor_name: row.visitor_name,
    visitor_company: row.visitor_company,
    visitor_type: row.visitor_type,
    gender: row.gender,
    host_department: row.host_department,
    host_name: row.host_name,
    purpose: row.purpose,
    installation_id: row.installation_id,
    installation_name: one2<{ name?: string }>(row.installation)?.name ?? null,
    depart_date: row.depart_date,
    return_date: row.return_date,
    overnight: row.overnight,
    accommodation_required: row.accommodation_required,
    emergency_contact: row.emergency_contact,
    status: row.status,
    reject_reason: row.reject_reason,
    allocation: alloc
      ? {
          id: alloc.id,
          room_id: alloc.room_id,
          room_label: room ? [room.block, room.room_number].filter(Boolean).join(" ") : null,
          from_date: alloc.from_date,
          to_date: alloc.to_date,
          status: alloc.status,
        }
      : null,
  };
}

const VISIT_SELECT =
  "id, visitor_name, visitor_company, visitor_type, gender, host_department, host_name, purpose," +
  " installation_id, depart_date, return_date, overnight, accommodation_required, emergency_contact," +
  " status, reject_reason," +
  " requester:profiles!offshore_visit_requests_requester_id_fkey(full_name)," +
  " installation:offshore_installations(name)," +
  " offshore_bed_allocations(id, room_id, from_date, to_date, status, room:offshore_rooms(room_number, block))";

export async function getMyVisitRequests(): Promise<VisitRequest[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("offshore_visit_requests")
    .select(VISIT_SELECT)
    .eq("requester_id", user.id)
    .order("depart_date", { ascending: false });
  return (data ?? []).map((r) => mapVisit(r as Record<string, any>));
}

export async function getAllVisitRequests(): Promise<VisitRequest[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_visit_requests")
    .select(VISIT_SELECT)
    .order("depart_date", { ascending: false });
  return (data ?? []).map((r) => mapVisit(r as Record<string, any>));
}

/**
 * Rooms with free beds across the full [from, to] stay on an installation.
 * Free = bed_count − fixed staff reservations − overlapping active allocations.
 * Blocked/maintenance rooms and incompatible gender rooms are excluded.
 */
export async function searchBedAvailability(input: {
  installationId: string;
  from: string;
  to: string;
  gender?: string;
}): Promise<RoomAvailability[]> {
  const supabase = createClient();
  const { data: rooms } = await supabase
    .from("offshore_rooms")
    .select(
      "id, room_number, block, room_type, bed_count, gender_restriction, status," +
        " offshore_staff(count)," +
        " offshore_bed_allocations(id, from_date, to_date, status)",
    )
    .eq("installation_id", input.installationId)
    .eq("is_active", true);

  const out: RoomAvailability[] = [];
  for (const r of (rooms ?? []) as Record<string, any>[]) {
    if (["blocked", "maintenance"].includes(r.status)) continue;
    // Gender compatibility: room "any" fits anyone; otherwise must match request.
    if (
      r.gender_restriction !== "any" &&
      input.gender &&
      input.gender !== "any" &&
      r.gender_restriction !== input.gender
    ) {
      continue;
    }
    const fixed = r.offshore_staff?.[0]?.count ?? 0;
    const overlapping = ((r.offshore_bed_allocations as any[]) ?? []).filter(
      (a) =>
        a.status !== "checked_out" && a.from_date <= input.to && a.to_date >= input.from,
    ).length;
    const free = (r.bed_count ?? 0) - fixed - overlapping;
    if (free > 0) {
      out.push({
        room_id: r.id,
        label: [r.block, r.room_number].filter(Boolean).join(" "),
        room_type: r.room_type,
        gender_restriction: r.gender_restriction,
        free_beds: free,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

// --- Trip manifests (Phase 3) ------------------------------------------------

function paxIssues(staff: Record<string, any> | undefined): string[] {
  if (!staff) return [];
  const issues: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  if (staff.travel_eligible === false) issues.push("not eligible");
  if (staff.medical_expiry && staff.medical_expiry < today) issues.push("medical expired");
  if (staff.bosiet_expiry && staff.bosiet_expiry < today) issues.push("BOSIET expired");
  if (staff.huet_expiry && staff.huet_expiry < today) issues.push("HUET expired");
  return issues;
}

export async function getManifests(): Promise<Manifest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_manifests")
    .select(
      "id, title, crew_id, installation_id, trip_type, direction, transport_mode, seat_capacity," +
        " scheduled_date, status, crew:offshore_crews(name), installation:offshore_installations(name)," +
        " offshore_manifest_pax(id, profile_id, person_name, position, boarded, no_show)",
    )
    .order("scheduled_date", { ascending: false });
  if (error) {
    console.error("getManifests:", error.message);
    return [];
  }

  // Eligibility is computed live from the roster so locked manifests still warn.
  const { data: staffRows } = await supabase
    .from("offshore_staff")
    .select("profile_id, travel_eligible, medical_expiry, bosiet_expiry, huet_expiry");
  const staffByProfile = new Map<string, Record<string, any>>();
  for (const s of staffRows ?? []) staffByProfile.set(s.profile_id as string, s);

  return (data ?? []).map((m: Record<string, any>) => ({
    id: m.id,
    title: m.title,
    crew_id: m.crew_id,
    crew_name: one2<{ name?: string }>(m.crew)?.name ?? null,
    installation_id: m.installation_id,
    installation_name: one2<{ name?: string }>(m.installation)?.name ?? null,
    trip_type: m.trip_type,
    direction: m.direction,
    transport_mode: m.transport_mode,
    seat_capacity: m.seat_capacity,
    scheduled_date: m.scheduled_date,
    status: m.status,
    pax: ((m.offshore_manifest_pax as any[]) ?? [])
      .map(
        (p): ManifestPax => ({
          id: p.id,
          profile_id: p.profile_id,
          person_name: p.person_name,
          position: p.position,
          boarded: p.boarded,
          no_show: p.no_show,
          issues: p.profile_id ? paxIssues(staffByProfile.get(p.profile_id)) : [],
        }),
      )
      .sort((a, b) => a.person_name.localeCompare(b.person_name)),
  }));
}

// --- History: POB as-of a date + room occupancy over a period ----------------

/** Reconstruct who was on board on a past (or current) date, from trips + visits. */
export async function getPobAsOf(date: string): Promise<PobAsOf> {
  const supabase = createClient();
  const [{ data: trips }, { data: visits }] = await Promise.all([
    supabase
      .from("offshore_trips")
      .select(
        "mobilize_date, demob_date, status," +
          " person:profiles!offshore_trips_profile_id_fkey(full_name, email)," +
          " installation:offshore_installations(name), crew:offshore_crews(name)",
      )
      .in("status", ["onboard", "demobilised"])
      .lte("mobilize_date", date),
    supabase
      .from("offshore_visit_requests")
      .select("visitor_name, depart_date, return_date, status, installation:offshore_installations(name)")
      .in("status", ["onboard", "returned"])
      .lte("depart_date", date),
  ]);

  const people: PobPerson[] = [];
  for (const t of (trips ?? []) as Record<string, any>[]) {
    if (t.demob_date && (t.demob_date as string) < date) continue; // left before this date
    const p = one2<{ full_name?: string; email?: string }>(t.person);
    people.push({
      name: p?.full_name || p?.email || "Crew",
      category: "staff",
      installation: one2<{ name?: string }>(t.installation)?.name ?? null,
      crew: one2<{ name?: string }>(t.crew)?.name ?? null,
      from: t.mobilize_date as string,
      to: (t.demob_date as string) ?? null,
    });
  }
  for (const v of (visits ?? []) as Record<string, any>[]) {
    if (v.return_date && (v.return_date as string) < date) continue;
    people.push({
      name: v.visitor_name as string,
      category: "visitor",
      installation: one2<{ name?: string }>(v.installation)?.name ?? null,
      crew: null,
      from: v.depart_date as string,
      to: (v.return_date as string) ?? null,
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  return {
    date,
    total: people.length,
    staff: people.filter((p) => p.category === "staff").length,
    visitor: people.filter((p) => p.category === "visitor").length,
    people,
  };
}

/** Who occupied which room over [from, to] — staff (fixed room on trips) + visitors (allocations). */
export async function getRoomHistory(from: string, to: string): Promise<RoomHistoryRow[]> {
  const supabase = createClient();
  const today = todayIso();
  const [{ data: trips }, { data: allocs }] = await Promise.all([
    supabase
      .from("offshore_trips")
      .select(
        "mobilize_date, demob_date, status," +
          " person:profiles!offshore_trips_profile_id_fkey(full_name, email)," +
          " room:offshore_rooms(room_number, block)," +
          " installation:offshore_installations(name)",
      )
      .in("status", ["onboard", "demobilised"])
      .not("room_id", "is", null)
      .lte("mobilize_date", to),
    supabase
      .from("offshore_bed_allocations")
      .select(
        "occupant_name, from_date, to_date, status," +
          " room:offshore_rooms(room_number, block, installation:offshore_installations(name))",
      )
      .lte("from_date", to),
  ]);

  const rows: RoomHistoryRow[] = [];
  for (const t of (trips ?? []) as Record<string, any>[]) {
    if (t.demob_date && (t.demob_date as string) < from) continue;
    const room = one2<{ room_number?: string; block?: string }>(t.room);
    if (!room) continue;
    const p = one2<{ full_name?: string; email?: string }>(t.person);
    rows.push({
      room_label: [room.block, room.room_number].filter(Boolean).join(" "),
      installation: one2<{ name?: string }>(t.installation)?.name ?? null,
      occupant: p?.full_name || p?.email || "Crew",
      category: "staff",
      from: t.mobilize_date as string,
      to: (t.demob_date as string) ?? null,
      current: !t.demob_date || (t.demob_date as string) >= today,
    });
  }
  for (const a of (allocs ?? []) as Record<string, any>[]) {
    if ((a.to_date as string) < from) continue;
    const room = one2<{ room_number?: string; block?: string; installation?: unknown }>(a.room);
    rows.push({
      room_label: room ? [room.block, room.room_number].filter(Boolean).join(" ") : "—",
      installation: room
        ? one2<{ name?: string }>(room.installation as any)?.name ?? null
        : null,
      occupant: a.occupant_name as string,
      category: "visitor",
      from: a.from_date as string,
      to: a.to_date as string,
      current: a.status !== "checked_out",
    });
  }
  return rows.sort(
    (a, b) => a.room_label.localeCompare(b.room_label) || a.from.localeCompare(b.from),
  );
}

// --- Catering / Daily Meal Sheet ---------------------------------------------

/** Meal-sheet rows already saved for an installation + date. */
export async function getMealSheet(
  installationId: string,
  date: string,
): Promise<MealEntry[]> {
  if (!installationId || !date) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_meal_entries")
    .select("id, person_name, category, breakfast, snack, lunch, dinner, lodging")
    .eq("installation_id", installationId)
    .eq("meal_date", date)
    .order("category")
    .order("person_name");
  return (data ?? []) as MealEntry[];
}

/** Expired / soon-to-expire certifications across the roster. */
export async function getCertAlerts(): Promise<CertAlert[]> {
  const roster = await getRoster();
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400_000);
  const alerts: CertAlert[] = [];
  const check = (name: string | null, kind: CertAlert["kind"], date: string | null) => {
    if (!date) return;
    const d = new Date(date);
    if (d <= soon) alerts.push({ full_name: name, kind, expiry: date, expired: d < now });
  };
  for (const r of roster) {
    check(r.full_name, "medical", r.medical_expiry);
    check(r.full_name, "bosiet", r.bosiet_expiry);
    check(r.full_name, "huet", r.huet_expiry);
  }
  return alerts.sort((a, b) => a.expiry.localeCompare(b.expiry));
}
