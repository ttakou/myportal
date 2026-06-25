import { createClient } from "@/lib/supabase/server";
import type {
  AccommodationSummary,
  Room,
  RoomAllocationReport,
  RoomAvailability,
  RoomHistoryRow,
} from "@/types/offshore";
import { one, todayIso } from "./_shared";

export async function getRooms(): Promise<Room[]> {
  const supabase = createClient();
  const [{ data, error }, { data: onboard }, { data: staff }, { data: fixedOwners }] = await Promise.all([
    supabase
      .from("offshore_rooms")
      .select(
        "id, installation_id, block, floor, room_number, room_type, bed_count, max_bed_count," +
          " gender_restriction, status, special_flag, notes, lifeboat," +
          " installation:offshore_installations(name), offshore_staff(count)",
      )
      .eq("is_active", true)
      .order("room_number"),
    supabase
      .from("offshore_trips")
      .select("id, room_id, bed_no, profile_id, person:profiles!offshore_trips_profile_id_fkey(full_name)")
      .eq("status", "onboard"),
    supabase
      .from("offshore_staff")
      .select("profile_id, b2b:profiles!offshore_staff_back_to_back_id_fkey(full_name)"),
    supabase
      .from("offshore_staff")
      .select(
        "profile_id, fixed_room_id, fixed_bed," +
          " profile:profiles!offshore_staff_profile_id_fkey(full_name)," +
          " b2b:profiles!offshore_staff_back_to_back_id_fkey(full_name)",
      )
      .not("fixed_room_id", "is", null),
  ]);
  if (error) {
    console.error("getRooms:", error.message);
    return [];
  }

  // profile -> back-to-back name
  const b2bByProfile = new Map<string, string | null>();
  for (const s of (staff ?? []) as Record<string, any>[]) {
    b2bByProfile.set(s.profile_id as string, one<{ full_name?: string }>(s.b2b)?.full_name ?? null);
  }

  // Default owners (fixed room) per room.
  const ownersByRoom = new Map<string, { profile_id: string; name: string; bed: string | null; back_to_back: string | null }[]>();
  for (const s of (fixedOwners ?? []) as Record<string, any>[]) {
    const rid = s.fixed_room_id as string | null;
    if (!rid) continue;
    const list = ownersByRoom.get(rid) ?? [];
    list.push({
      profile_id: s.profile_id as string,
      name: one<{ full_name?: string }>(s.profile)?.full_name ?? "—",
      bed: (s.fixed_bed as string | null) ?? null,
      back_to_back: one<{ full_name?: string }>(s.b2b)?.full_name ?? null,
    });
    ownersByRoom.set(rid, list);
  }

  // Live occupants per room from on-board trips.
  const occByRoom = new Map<
    string,
    { trip_id: string; profile_id: string | null; name: string; bed_no: string | null; b2b_name: string | null }[]
  >();
  for (const t of (onboard ?? []) as Record<string, any>[]) {
    const rid = t.room_id as string | null;
    if (!rid) continue;
    const list = occByRoom.get(rid) ?? [];
    list.push({
      trip_id: t.id as string,
      profile_id: (t.profile_id as string | null) ?? null,
      name: one<{ full_name?: string }>(t.person)?.full_name ?? "—",
      bed_no: (t.bed_no as string | null) ?? null,
      b2b_name: t.profile_id ? b2bByProfile.get(t.profile_id as string) ?? null : null,
    });
    occByRoom.set(rid, list);
  }

  return (data ?? []).map((r: Record<string, any>) => {
    const occupants = (occByRoom.get(r.id as string) ?? []).sort(
      (a, b) => (a.bed_no ?? "").localeCompare(b.bed_no ?? "") || a.name.localeCompare(b.name),
    );
    return {
      id: r.id,
      installation_id: r.installation_id,
      installation_name: one<{ name?: string }>(r.installation)?.name ?? null,
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
      lifeboat: (r.lifeboat as string | null) ?? null,
      fixed_assigned: r.offshore_staff?.[0]?.count ?? 0,
      owners: (ownersByRoom.get(r.id as string) ?? []).sort((a, b) =>
        (a.bed ?? "").localeCompare(b.bed ?? "") || a.name.localeCompare(b.name),
      ),
      occupied: occupants.length,
      occupants,
    };
  });
}

/** Accommodation rollup across rooms + current on-board occupancy. */
export async function getAccommodationSummary(): Promise<AccommodationSummary> {
  const supabase = createClient();
  const [{ data: rooms }, { data: onboard }] = await Promise.all([
    supabase
      .from("offshore_rooms")
      .select("id, room_number, block, bed_count, status, offshore_staff(count)")
      .eq("is_active", true),
    supabase
      .from("offshore_trips")
      .select("id, room_id, bed_no, person:profiles!offshore_trips_profile_id_fkey(full_name)")
      .eq("status", "onboard"),
  ]);

  // On-board occupants per room (a 2-bed room may hold 4 on day/night shift).
  const occByRoom = new Map<string, { trip_id: string; name: string; bed_no: string | null }[]>();
  let occupiedBeds = 0;
  for (const t of (onboard ?? []) as Record<string, any>[]) {
    occupiedBeds++;
    const rid = t.room_id as string | null;
    if (!rid) continue;
    const list = occByRoom.get(rid) ?? [];
    list.push({
      trip_id: t.id as string,
      name: one<{ full_name?: string }>(t.person)?.full_name ?? "—",
      bed_no: (t.bed_no as string | null) ?? null,
    });
    occByRoom.set(rid, list);
  }

  let totalBeds = 0;
  let fixedBeds = 0;
  let blockedRooms = 0;
  const overbooked: AccommodationSummary["overbooked"] = [];
  for (const r of (rooms ?? []) as Record<string, any>[]) {
    const blocked = ["blocked", "maintenance"].includes(r.status);
    if (blocked) blockedRooms++;
    else totalBeds += r.bed_count ?? 0;
    fixedBeds += r.offshore_staff?.[0]?.count ?? 0;
    const occupants = occByRoom.get(r.id as string) ?? [];
    if (occupants.length > (r.bed_count ?? 0)) {
      overbooked.push({
        room_id: r.id as string,
        label: [r.block, r.room_number].filter(Boolean).join(" "),
        beds: r.bed_count ?? 0,
        occupants: occupants.sort((a, b) => (a.bed_no ?? "").localeCompare(b.bed_no ?? "")),
      });
    }
  }
  return {
    totalRooms: rooms?.length ?? 0,
    totalBeds,
    fixedBeds,
    occupiedBeds,
    blockedRooms,
    availableBeds: Math.max(0, totalBeds - occupiedBeds),
    sharedRooms: overbooked.length,
    overbooked: overbooked.sort((a, b) => a.label.localeCompare(b.label)),
  };
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
    const room = one<{ room_number?: string; block?: string }>(t.room);
    if (!room) continue;
    const p = one<{ full_name?: string; email?: string }>(t.person);
    rows.push({
      room_label: [room.block, room.room_number].filter(Boolean).join(" "),
      installation: one<{ name?: string }>(t.installation)?.name ?? null,
      occupant: p?.full_name || p?.email || "Crew",
      category: "staff",
      from: t.mobilize_date as string,
      to: (t.demob_date as string) ?? null,
      current: !t.demob_date || (t.demob_date as string) >= today,
    });
  }
  for (const a of (allocs ?? []) as Record<string, any>[]) {
    if ((a.to_date as string) < from) continue;
    const room = one<{ room_number?: string; block?: string; installation?: unknown }>(a.room);
    rows.push({
      room_label: room ? [room.block, room.room_number].filter(Boolean).join(" ") : "—",
      installation: room
        ? one<{ name?: string }>(room.installation as any)?.name ?? null
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

/** Room allocation snapshot as of a date (staff trips + visitor bed allocations). */
export async function getRoomAllocationAsOf(date: string): Promise<RoomAllocationReport> {
  const supabase = createClient();
  const [{ data: rooms }, { data: trips }, { data: allocs }, { data: fixedOwners }] = await Promise.all([
    supabase
      .from("offshore_rooms")
      .select("id, block, room_number, bed_count, lifeboat, installation:offshore_installations(name)")
      .eq("is_active", true)
      .order("room_number"),
    supabase
      .from("offshore_trips")
      .select(
        "room_id, bed_no, mobilize_date, demob_date, status," +
          " person:profiles!offshore_trips_profile_id_fkey(full_name)",
      )
      .in("status", ["onboard", "demobilised"])
      .not("room_id", "is", null)
      .lte("mobilize_date", date),
    supabase
      .from("offshore_bed_allocations")
      .select("room_id, occupant_name, from_date, to_date, status")
      .lte("from_date", date)
      .gte("to_date", date)
      .neq("status", "checked_out"),
    supabase
      .from("offshore_staff")
      .select(
        "fixed_room_id, fixed_bed," +
          " profile:profiles!offshore_staff_profile_id_fkey(full_name)," +
          " b2b:profiles!offshore_staff_back_to_back_id_fkey(full_name)",
      )
      .not("fixed_room_id", "is", null),
  ]);

  const ownersByRoom = new Map<string, { name: string; bed: string | null; back_to_back: string | null }[]>();
  for (const s of (fixedOwners ?? []) as Record<string, any>[]) {
    const rid = s.fixed_room_id as string;
    const list = ownersByRoom.get(rid) ?? [];
    list.push({
      name: one<{ full_name?: string }>(s.profile)?.full_name ?? "—",
      bed: (s.fixed_bed as string | null) ?? null,
      back_to_back: one<{ full_name?: string }>(s.b2b)?.full_name ?? null,
    });
    ownersByRoom.set(rid, list);
  }

  const occByRoom = new Map<
    string,
    { name: string; bed_no: string | null; category: "staff" | "visitor" }[]
  >();
  for (const t of (trips ?? []) as Record<string, any>[]) {
    if (t.demob_date && (t.demob_date as string) < date) continue; // left before this date
    const rid = t.room_id as string;
    const list = occByRoom.get(rid) ?? [];
    list.push({
      name: one<{ full_name?: string }>(t.person)?.full_name ?? "—",
      bed_no: (t.bed_no as string | null) ?? null,
      category: "staff",
    });
    occByRoom.set(rid, list);
  }
  for (const a of (allocs ?? []) as Record<string, any>[]) {
    const rid = a.room_id as string | null;
    if (!rid) continue;
    const list = occByRoom.get(rid) ?? [];
    list.push({ name: a.occupant_name as string, bed_no: null, category: "visitor" });
    occByRoom.set(rid, list);
  }

  const mapped = (rooms ?? []).map((r: Record<string, any>) => {
    const occupants = (occByRoom.get(r.id as string) ?? []).sort(
      (a, b) => (a.bed_no ?? "").localeCompare(b.bed_no ?? "") || a.name.localeCompare(b.name),
    );
    return {
      id: r.id as string,
      label: [r.block, r.room_number].filter(Boolean).join(" "),
      installation: one<{ name?: string }>(r.installation)?.name ?? null,
      beds: (r.bed_count as number) ?? 0,
      lifeboat: (r.lifeboat as string | null) ?? null,
      occupants,
      owners: ownersByRoom.get(r.id as string) ?? [],
    };
  });
  // Occupied rooms first.
  mapped.sort((a, b) => b.occupants.length - a.occupants.length || a.label.localeCompare(b.label));

  return {
    date,
    totalOccupants: mapped.reduce((n, r) => n + r.occupants.length, 0),
    roomsInUse: mapped.filter((r) => r.occupants.length > 0).length,
    rooms: mapped,
  };
}
