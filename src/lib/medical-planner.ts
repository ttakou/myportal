// Pure scheduling logic for the annual medical campaign. No I/O — takes the
// candidates (with rotation + training-busy info) and campaign parameters and
// returns a proposed two-visit schedule per person. Kept pure so it is unit
// tested and reused by both the server action and the client re-validation.

const DAY_MS = 86_400_000;

export interface CampaignParams {
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  capacityPerDay: number; // max people booked per clinic (visit-1) day
  visitGapDays?: number; // days between visit 1 and visit 2 (default 3)
  clinicWeekdays?: number[]; // 0=Sun..6=Sat; default [2,4] = Tue & Thu
}

export interface CrewRotation {
  cycleStart: string; // ISO
  offshoreDays: number;
  onshoreDays: number;
}

export interface PlanCandidate {
  profileId: string;
  name: string;
  /** Rotation for offshore staff; null/absent = always available (onshore). */
  crew?: CrewRotation | null;
  /** ISO dates blocked by a planned/scheduled training (hard block). */
  busyDates?: string[];
  /** For prioritisation — soonest-expiring first. */
  medicalExpiry?: string | null;
}

export type PlanStatus = "ok" | "unscheduled";

export interface PlannedRow {
  profileId: string;
  name: string;
  visit1: string | null;
  visit2: string | null;
  status: PlanStatus;
  reason?: string;
}

/* ---- date helpers (UTC, ISO in/out) ------------------------------------- */

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function iso(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
function addDays(isoDate: string, n: number): string {
  return iso(new Date(d(isoDate).getTime() + n * DAY_MS));
}
function weekday(isoDate: string): number {
  return d(isoDate).getUTCDay();
}
/** Push a weekend date to the following Monday. */
export function rollOffWeekend(isoDate: string): string {
  const wd = weekday(isoDate);
  if (wd === 6) return addDays(isoDate, 2); // Sat → Mon
  if (wd === 0) return addDays(isoDate, 1); // Sun → Mon
  return isoDate;
}

/** First date on/after `from` that is a Tuesday. */
export function firstTuesdayOnOrAfter(from: string): string {
  let cur = from;
  for (let i = 0; i < 7; i++) {
    if (weekday(cur) === 2) return cur;
    cur = addDays(cur, 1);
  }
  return from; // unreachable
}

/** Is the crew onshore on `isoDate`? Mirrors the crew-change rotation math. */
export function isOnshoreOn(crew: CrewRotation | null | undefined, isoDate: string): boolean {
  if (!crew || !crew.cycleStart) return true; // onshore staff / no rotation
  const period = crew.offshoreDays + crew.onshoreDays;
  if (period <= 0) return true;
  const diff = Math.floor((d(isoDate).getTime() - d(crew.cycleStart).getTime()) / DAY_MS);
  const idx = ((diff % period) + period) % period;
  return idx >= crew.offshoreDays; // offshore for the first offshoreDays of the cycle
}

/** Ordered list of clinic (visit-1) days in the window, starting a Tuesday. */
export function clinicDays(params: CampaignParams): string[] {
  const weekdays = params.clinicWeekdays?.length ? params.clinicWeekdays : [2, 4];
  const first = firstTuesdayOnOrAfter(params.startDate);
  const out: string[] = [];
  for (let cur = first; cur <= params.endDate; cur = addDays(cur, 1)) {
    if (weekdays.includes(weekday(cur))) out.push(cur);
  }
  return out;
}

/** Whether a person can attend on `isoDate`: onshore and training-free. */
export function isAvailable(c: PlanCandidate, isoDate: string): { ok: boolean; reason?: string } {
  if (!isOnshoreOn(c.crew, isoDate)) return { ok: false, reason: "offshore (rotation)" };
  if ((c.busyDates ?? []).includes(isoDate)) return { ok: false, reason: "training conflict" };
  return { ok: true };
}

function byPriority(a: PlanCandidate, b: PlanCandidate): number {
  const ax = a.medicalExpiry ?? "9999-12-31";
  const bx = b.medicalExpiry ?? "9999-12-31";
  if (ax !== bx) return ax < bx ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Build the proposed campaign. Greedy & explainable: soonest-expiring first,
 * each person gets the earliest clinic day where they're onshore, training-free
 * and the day has capacity; visit 2 lands `gap` days later (rolled off weekends)
 * and must also be onshore, training-free and within the window.
 */
export function planCampaign(params: CampaignParams, candidates: PlanCandidate[]): PlannedRow[] {
  const gap = params.visitGapDays ?? 3;
  const days = clinicDays(params);
  const used = new Map<string, number>(); // clinic day -> booked count
  const rows: PlannedRow[] = [];

  for (const c of [...candidates].sort(byPriority)) {
    let placed: PlannedRow | null = null;
    let sawCapacityButBlocked = false;

    for (const day of days) {
      if ((used.get(day) ?? 0) >= params.capacityPerDay) continue;
      const a1 = isAvailable(c, day);
      if (!a1.ok) {
        sawCapacityButBlocked = true;
        continue;
      }
      const v2 = rollOffWeekend(addDays(day, gap));
      if (v2 > params.endDate) continue;
      const a2 = isAvailable(c, v2);
      if (!a2.ok) {
        sawCapacityButBlocked = true;
        continue;
      }
      used.set(day, (used.get(day) ?? 0) + 1);
      placed = { profileId: c.profileId, name: c.name, visit1: day, visit2: v2, status: "ok" };
      break;
    }

    rows.push(
      placed ?? {
        profileId: c.profileId,
        name: c.name,
        visit1: null,
        visit2: null,
        status: "unscheduled",
        reason: days.length === 0
          ? "No clinic days in the window"
          : sawCapacityButBlocked
            ? "Always offshore or training-clashing on available clinic days"
            : "All clinic days are at capacity",
      },
    );
  }

  return rows;
}
