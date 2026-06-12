import { createClient } from "@/lib/supabase/server";
import type {
  AccommodationSummary,
  CertAlert,
  Crew,
  Flight,
  Installation,
  OffshoreTrip,
  Pob,
  PobBreakdown,
  Room,
  RosterEntry,
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

export async function getCrews(): Promise<Crew[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_crews")
    .select(
      "id, name, installation_id, rotation_pattern, offshore_days, onshore_days," +
        " transport_mode, departure_location, color, is_active," +
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
  }));
}

export async function getRooms(): Promise<Room[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_rooms")
    .select(
      "id, installation_id, block, room_number, room_type, bed_count, max_bed_count," +
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
      "id, profile_id, crew_id, position, fixed_room_id, fixed_bed, medical_expiry," +
        " bosiet_expiry, huet_expiry, emergency_contact, travel_eligible," +
        " profile:profiles!offshore_staff_profile_id_fkey(full_name, email)," +
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

  const [{ data: onboard }, { data: pob }, { data: arrivals }] = await Promise.all([
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
  ]);

  const rows = onboard ?? [];
  const byCrewMap = new Map<string, number>();
  let staff = 0;
  let visitor = 0;
  let departuresToday = 0;
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

  return {
    total: rows.length,
    byInstallation: (pob ?? []).map((p) => ({
      name: p.name as string,
      pob: (p.pob as number) ?? 0,
      capacity: (p.pob_capacity as number) ?? 0,
    })),
    byCrew: [...byCrewMap.entries()].map(([name, n]) => ({ name, pob: n })),
    byCategory: { staff, visitor },
    arrivalsToday: arrivals?.length ?? 0,
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
