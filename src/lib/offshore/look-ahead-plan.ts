/**
 * Look-ahead bed planning: who will need a bed over the coming days, and
 * whether there is one.
 *
 * Starting from who is on board today, the days are walked in order: people
 * leave on their demob date, arrivals go to their own cabin when it has a free
 * bed (a "swap" when it is only free because someone left that day), and
 * otherwise the room with the most free beds is suggested. An arrival whose
 * cabin is full is a conflict, naming who is in it; one with nowhere to go is
 * short of a bed. People still on board past their demob date are kept on
 * board — they have not left — and marked as overstaying.
 *
 * Pure: rooms and people in, a plan out.
 */

export interface PlanRoom {
  id: string;
  label: string;
  beds: number;
  /** Blocked or under maintenance: takes nobody new. */
  closed: boolean;
}

export interface PlanOccupant {
  name: string;
  roomId: string | null;
  /** Planned departure; null when open-ended. */
  until: string | null;
}

export interface PlanArrival {
  key: string;
  name: string;
  crew: string | null;
  /** Their own (roster) cabin, if any. */
  cabinId: string | null;
  /** When they leave again; null when open-ended. */
  until: string | null;
  /** A visitor already holding a booked bed goes straight there. */
  bookedRoomId?: string | null;
}

export type BedStatus = "own" | "swap" | "conflict" | "suggest" | "none";

export interface ArrivalPlan {
  key: string;
  name: string;
  crew: string | null;
  status: BedStatus;
  /** The room they go to (own, swap, suggested), if any. */
  room: string | null;
  /** Their own cabin, when it is not where they go. */
  cabin: string | null;
  /** Who fills their cabin on a conflict; "(overstaying)" marks anyone past their demob date. */
  blockers: string[];
  blockedByOverstayer: boolean;
}

export interface DayPlan {
  date: string;
  arrivals: ArrivalPlan[];
  /** Beds left free in open rooms at the end of the day. */
  free: number;
  /** Arrivals with no bed at all. */
  short: number;
}

/**
 * Plan every day from `days[0]`: `today` decides who is overstaying (still on
 * board after their demob date).
 */
export function planBeds(input: {
  today: string;
  days: string[];
  rooms: PlanRoom[];
  onboard: PlanOccupant[];
  arrivalsOn: (date: string) => PlanArrival[];
}): DayPlan[] {
  const rooms = new Map(input.rooms.map((r) => [r.id, r]));
  type Occ = { name: string; until: string | null; overstaying: boolean };
  const occ = new Map<string, Occ[]>();
  for (const r of input.rooms) occ.set(r.id, []);
  for (const o of input.onboard) {
    if (!o.roomId || !occ.has(o.roomId)) continue;
    const overstaying = !!o.until && o.until < input.today;
    occ.get(o.roomId)!.push({ name: o.name, until: o.until, overstaying });
  }
  const freeIn = (id: string) => {
    const r = rooms.get(id);
    return r && !r.closed ? r.beds - (occ.get(id)?.length ?? 0) : 0;
  };
  const roomLabel = (id: string | null) => (id ? rooms.get(id)?.label ?? null : null);

  const out: DayPlan[] = [];
  for (const date of input.days) {
    // Departures first: their beds are free for today's arrivals.
    const leftToday = new Map<string, number>();
    for (const [id, list] of occ) {
      const stay = list.filter((p) => p.overstaying || !p.until || p.until > date);
      if (stay.length !== list.length) leftToday.set(id, list.length - stay.length);
      occ.set(id, stay);
    }

    const arrivals: ArrivalPlan[] = [];
    const place = (a: PlanArrival, id: string, status: BedStatus, extra: Partial<ArrivalPlan> = {}) => {
      occ.get(id)!.push({ name: a.name, until: a.until, overstaying: false });
      arrivals.push({ key: a.key, name: a.name, crew: a.crew, status, room: roomLabel(id), cabin: null, blockers: [], blockedByOverstayer: false, ...extra });
    };
    const unplaced: { a: PlanArrival; conflict: ArrivalPlan | null }[] = [];

    for (const a of input.arrivalsOn(date)) {
      const target = a.bookedRoomId ?? a.cabinId;
      if (target && occ.has(target) && freeIn(target) > 0) {
        const swap = !a.bookedRoomId && freeIn(target) <= (leftToday.get(target) ?? 0);
        place(a, target, swap ? "swap" : "own");
        continue;
      }
      if (target && occ.has(target)) {
        const inIt = occ.get(target)!;
        unplaced.push({
          a,
          conflict: {
            key: a.key,
            name: a.name,
            crew: a.crew,
            status: "conflict",
            room: null,
            cabin: roomLabel(target),
            blockers: inIt.map((p) => (p.overstaying ? `${p.name} (overstaying)` : p.name)),
            blockedByOverstayer: inIt.some((p) => p.overstaying),
          },
        });
        continue;
      }
      unplaced.push({ a, conflict: null });
    }

    // Everyone without their own bed: the room with most room, if any.
    for (const { a, conflict } of unplaced) {
      let best: string | null = null;
      for (const r of input.rooms) if (freeIn(r.id) > 0 && (!best || freeIn(r.id) > freeIn(best))) best = r.id;
      if (conflict) {
        if (best) occ.get(best)!.push({ name: a.name, until: a.until, overstaying: false });
        arrivals.push({ ...conflict, room: roomLabel(best) });
      } else if (best) {
        place(a, best, "suggest", { cabin: null });
      } else {
        arrivals.push({ key: a.key, name: a.name, crew: a.crew, status: "none", room: null, cabin: null, blockers: [], blockedByOverstayer: false });
      }
    }

    const free = input.rooms.reduce((n, r) => n + Math.max(0, freeIn(r.id)), 0);
    out.push({
      date,
      arrivals,
      free,
      short: arrivals.filter((x) => x.status === "none" || (x.status === "conflict" && !x.room)).length,
    });
  }
  return out;
}

/** Every date from `from` for `n` days. */
export function nextDays(from: string, n: number): string[] {
  const start = Date.parse(from + "T00:00:00Z");
  return Array.from({ length: n }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}
