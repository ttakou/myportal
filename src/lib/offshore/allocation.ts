/**
 * Pure bed-allocation planner (no I/O) — the placement rules behind the
 * one-click "Auto-allocate beds", extracted so they can be unit-tested.
 *
 * Rules (see autoAllocateBeds):
 *  - a person's fixed cabin is honoured first when it still has a free bed
 *    (their fixed bed label when free, else the next free label);
 *  - everyone else fills rooms open to anyone ("any" gender), crew by crew,
 *    picking the emptiest room and filling it before opening the next;
 *  - gender-restricted rooms are never auto-filled (staff gender is not
 *    recorded), blocked / under-maintenance rooms are skipped;
 *  - beds are auto-numbered "Bed N", skipping labels already in use.
 */

export interface AllocPerson {
  id: string; // trip id
  profile_id: string | null;
  crew_id: string | null;
  room_id: string | null;
  bed_no: string | null;
}

export interface AllocRoom {
  id: string;
  bed_count: number;
  gender_restriction: string;
  status: string;
}

export interface AllocFixed {
  room_id: string | null;
  bed: string | null;
}

export interface AllocationPlan {
  assignments: { id: string; room_id: string; bed_no: string }[];
  unplaced: number;
}

export function planBedAllocation(input: {
  onboard: AllocPerson[];
  rooms: AllocRoom[];
  /** room_id of each active visitor bed allocation (each occupies one bed). */
  visitorAllocations: (string | null)[];
  /** Fixed cabin per profile id (roster). */
  fixedByProfile: Map<string, AllocFixed>;
}): AllocationPlan {
  const { onboard, visitorAllocations, fixedByProfile } = input;
  const needBed = onboard.filter((t) => !t.room_id);
  if (needBed.length === 0) return { assignments: [], unplaced: 0 };

  const rooms = input.rooms.filter((r) => !["blocked", "maintenance"].includes(r.status));

  type RoomState = { cap: number; gender: string; used: number; beds: Set<string> };
  const state = new Map<string, RoomState>();
  for (const r of rooms)
    state.set(r.id, {
      cap: r.bed_count ?? 0,
      gender: r.gender_restriction ?? "any",
      used: 0,
      beds: new Set<string>(),
    });
  for (const t of onboard) {
    if (!t.room_id) continue;
    const st = state.get(t.room_id);
    if (!st) continue;
    st.used++;
    if (t.bed_no) st.beds.add(t.bed_no);
  }
  for (const roomId of visitorAllocations) {
    const st = roomId ? state.get(roomId) : null;
    if (st) st.used++;
  }

  const freeBeds = (st: RoomState) => Math.max(0, st.cap - st.used);
  const nextBed = (st: RoomState) => {
    for (let n = 1; n <= st.cap; n++) {
      const lbl = `Bed ${n}`;
      if (!st.beds.has(lbl)) return lbl;
    }
    return `Bed ${st.used + 1}`;
  };
  const seat = (st: RoomState, bed: string) => {
    st.used++;
    st.beds.add(bed);
  };
  const emptiestAnyRoom = (): string | null => {
    let best: string | null = null;
    let bestFree = 0;
    for (const [rid, st] of state) {
      if (st.gender !== "any") continue;
      const f = freeBeds(st);
      if (f > bestFree) {
        bestFree = f;
        best = rid;
      }
    }
    return best;
  };

  // Seat crew-by-crew, filling one room before opening the next.
  const order = [...needBed].sort((a, b) => (a.crew_id ?? "").localeCompare(b.crew_id ?? ""));
  const assignments: { id: string; room_id: string; bed_no: string }[] = [];
  let unplaced = 0;
  let curId: string | null = null;

  for (const person of order) {
    const fixed = person.profile_id ? fixedByProfile.get(person.profile_id) : undefined;
    if (fixed?.room_id) {
      const st = state.get(fixed.room_id);
      if (st && freeBeds(st) > 0) {
        const bed = fixed.bed && !st.beds.has(fixed.bed) ? fixed.bed : nextBed(st);
        seat(st, bed);
        assignments.push({ id: person.id, room_id: fixed.room_id, bed_no: bed });
        continue;
      }
    }
    if (!curId || freeBeds(state.get(curId)!) === 0) curId = emptiestAnyRoom();
    if (curId) {
      const st = state.get(curId)!;
      const bed = nextBed(st);
      seat(st, bed);
      assignments.push({ id: person.id, room_id: curId, bed_no: bed });
    } else {
      unplaced++;
    }
  }

  return { assignments, unplaced };
}
