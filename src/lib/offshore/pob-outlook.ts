/**
 * How many people each installation will have on board, day by day.
 *
 * Rotational crews are placed by their rotation schedule and nothing else: a
 * crew member is on board on the days of the cycle's offshore half, whatever
 * their trips say, so a late or early traveller never shifts the count. On
 * top of the schedule come the people whose presence is booked rather than
 * scheduled: non-rotational staff and contractors on a trip, a rotational
 * member on an extra trip they requested, and visitors. Anyone counted twice
 * (a scheduled member who also holds a trip) is counted once.
 *
 * A day runs from arrival to departure: somebody arriving on the 3rd and
 * leaving on the 10th is on board the 3rd to the 9th, which is also how the
 * cycle reads (the demob day is the first day ashore). A day visit counts on
 * its day.
 *
 * Pure: schedule and bookings in, counts out.
 */

import { cycleDayIndex, type RotationCycle } from "./rotation-math";

export interface OutlookInstallation {
  id: string;
  name: string;
  /** Beds / POB limit; 0 when not set. */
  capacity: number;
}

export interface OutlookCrew extends RotationCycle {
  id: string;
  name: string;
  installationId: string | null;
  /** Rotational members' profile ids. */
  members: string[];
}

export interface OutlookStay {
  /** One person, however many bookings: "p:<profile>" or a per-booking key. */
  person: string;
  installationId: string | null;
  from: string;
  /** Departure date (not on board that day); null runs to the end of the range. */
  to: string | null;
  /** Awaiting a decision: shown apart, not in the confirmed count. */
  pending: boolean;
}

export interface OutlookDay {
  date: string;
  /** Everybody confirmed on board. */
  total: number;
  /** Of whom placed by a crew's rotation schedule. */
  rotational: number;
  /** Requests still awaiting a decision that would add to the total. */
  pending: number;
  /** Crew members the schedule sends out / brings back that day. */
  mob: number;
  demob: number;
  capacity: number;
  /** Over the POB limit (only when a limit is set). */
  over: boolean;
  /** Over the limit if every pending request were approved. */
  overIfApproved: boolean;
}

export interface InstallationOutlook {
  installation: OutlookInstallation;
  days: OutlookDay[];
  /** The fullest confirmed day. */
  peak: number;
}

const DAY = 86_400_000;
const dayMs = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = dayMs(from); t <= dayMs(to); t += DAY) out.push(toIso(t));
  return out;
}

/** On board on `date`: arrived by then and not yet left. */
export function staysOn(s: Pick<OutlookStay, "from" | "to">, date: string): boolean {
  return s.from <= date && (s.to === null || date < s.to);
}

/** A visit's stay; a day visit (no return, or back the same day) counts on its day. */
export function visitStay(depart: string, ret: string | null): { from: string; to: string } {
  const next = toIso(dayMs(depart) + DAY);
  return { from: depart, to: ret && ret > depart ? ret : next };
}

export function pobOutlook(input: {
  from: string;
  to: string;
  installations: OutlookInstallation[];
  crews: OutlookCrew[];
  stays: OutlookStay[];
  /**
   * Days a rotational member is ashore although the schedule has them on
   * board (an approved late mobilisation or early demobilisation).
   */
  away?: Pick<OutlookStay, "person" | "from" | "to">[];
  /** Where crews and bookings with no installation go. */
  defaultInstallationId: string | null;
}): InstallationOutlook[] {
  const fallback = input.defaultInstallationId ?? input.installations[0]?.id ?? null;
  const where = (id: string | null) => id ?? fallback;
  const days = eachDay(input.from, input.to);

  return input.installations.map((inst) => {
    const crews = input.crews.filter((c) => where(c.installationId) === inst.id);
    const stays = input.stays.filter((s) => where(s.installationId) === inst.id);
    const out: OutlookDay[] = days.map((date) => {
      const onboard = new Set<string>();
      let rotational = 0;
      let mob = 0;
      let demob = 0;
      for (const c of crews) {
        const idx = cycleDayIndex(c, date);
        if (idx === null) continue;
        if (idx === 0) mob += c.members.length;
        if (idx === c.offshore_days) demob += c.members.length;
        if (idx < c.offshore_days) {
          for (const m of c.members) {
            const key = `p:${m}`;
            if ((input.away ?? []).some((a) => a.person === key && staysOn(a, date))) continue;
            if (!onboard.has(key)) {
              onboard.add(key);
              rotational += 1;
            }
          }
        }
      }
      const waiting = new Set<string>();
      for (const s of stays) {
        if (!staysOn(s, date)) continue;
        if (s.pending) waiting.add(s.person);
        else onboard.add(s.person);
      }
      let pending = 0;
      for (const p of waiting) if (!onboard.has(p)) pending += 1;
      const total = onboard.size;
      const cap = inst.capacity;
      return {
        date,
        total,
        rotational,
        pending,
        mob,
        demob,
        capacity: cap,
        over: cap > 0 && total > cap,
        overIfApproved: cap > 0 && total + pending > cap,
      };
    });
    return { installation: inst, days: out, peak: out.reduce((m, d) => Math.max(m, d.total), 0) };
  });
}

/**
 * The fullest day on an installation over a stay, and the limit: what one
 * request means for the POB. For a request still pending, its own person is
 * added to the confirmed count of each day it covers.
 */
export function peakDuring(
  outlook: InstallationOutlook[],
  installationId: string | null,
  stay: { from: string; to: string | null },
  addSelf: boolean,
): { peak: number; capacity: number; date: string | null; over: boolean } | null {
  const inst = outlook.find((o) => o.installation.id === installationId) ?? (installationId === null ? outlook[0] : undefined);
  if (!inst) return null;
  let best: OutlookDay | null = null;
  for (const d of inst.days) {
    if (!staysOn(stay, d.date)) continue;
    if (!best || d.total > best.total) best = d;
  }
  if (!best) return null;
  const peak = best.total + (addSelf ? 1 : 0);
  const capacity = inst.installation.capacity;
  return { peak, capacity, date: best.date, over: capacity > 0 && peak > capacity };
}
